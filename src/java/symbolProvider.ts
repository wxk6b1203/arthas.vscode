/**
 * 主路径：借助 redhat.java（Language Support for Java）的 DocumentSymbol
 * 构建与文本解析器相同结构的 JavaFileModel。
 */
import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind, TextDocument } from 'vscode';
import { JavaFileModel, MemberDecl, TypeDecl, TypeKind } from './model';
import { parseFieldTypeName, parseParamTypes } from './textParser';

function symbolToTypeKind(kind: SymbolKind): TypeKind | null {
  switch (kind) {
    case SymbolKind.Class:
    case SymbolKind.Struct:
      return 'class';
    case SymbolKind.Interface:
      return 'interface';
    case SymbolKind.Enum:
    case SymbolKind.EnumMember:
      return kind === SymbolKind.Enum ? 'enum' : null;
    default:
      return null;
  }
}

function isMethodKind(kind: SymbolKind): boolean {
  return kind === SymbolKind.Method || kind === SymbolKind.Constructor;
}

function isFieldKind(kind: SymbolKind): boolean {
  return kind === SymbolKind.Field || kind === SymbolKind.Property || kind === SymbolKind.Constant || kind === SymbolKind.EnumMember;
}

/** 读取声明行原始文本（跨行取到 ')' 或 ';' 为止），用于修饰符/签名解析 */
function declText(document: TextDocument, startLine: number): string {
  const parts: string[] = [];
  for (let l = startLine; l < Math.min(startLine + 5, document.lineCount); l++) {
    const t = document.lineAt(l).text;
    parts.push(t);
    if (/[;{]/.test(t)) {
      break;
    }
  }
  return parts.join(' ');
}

function modifiersOf(document: TextDocument, startLine: number): { isStatic: boolean; isFinal: boolean } {
  const text = declText(document, startLine);
  return {
    isStatic: /(^|[\s{;])static\b/.test(text),
    isFinal: /(^|[\s{;])final\b/.test(text),
  };
}

function convertSymbol(sym: DocumentSymbol, document: TextDocument, parent: TypeDecl | null, types: TypeDecl[]): void {
  const typeKind = symbolToTypeKind(sym.kind);
  const startLine = sym.range.start.line;
  const endLine = sym.range.end.line;

  if (typeKind) {
    const decl: TypeDecl = {
      kind: typeKind,
      name: sym.name,
      declLine: startLine,
      bodyStartLine: startLine,
      bodyEndLine: endLine,
      methods: [],
      fields: [],
      enumConstants: [],
      children: [],
    };
    if (parent) {
      parent.children.push(decl);
    } else {
      types.push(decl);
    }
    for (const child of sym.children ?? []) {
      convertSymbol(child, document, decl, types);
    }
    return;
  }

  if (isMethodKind(sym.kind)) {
    if (!parent) {
      return;
    }
    const text = declText(document, startLine);
    const mods = modifiersOf(document, startLine);
    const firstParen = text.indexOf('(');
    const annotationBeforeParen = firstParen >= 0 && text.slice(0, firstParen).includes('@');
    const paramTypes = firstParen >= 0 && !annotationBeforeParen
      ? parseParamTypes(text)
      : fallbackParamsFromDetail(sym.detail);
    const member: MemberDecl = {
      name: sym.name,
      declLine: startLine,
      endLine: endLine,
      paramTypes,
      isStatic: mods.isStatic,
      isFinal: mods.isFinal,
    };
    parent.methods.push(member);
    return;
  }

  if (isFieldKind(sym.kind)) {
    if (!parent) {
      return;
    }
    const text = declText(document, startLine);
    const mods = modifiersOf(document, startLine);
    const parsed = parseFieldTypeName(text);
    const member: MemberDecl = {
      name: sym.name,
      declLine: startLine,
      endLine: startLine,
      paramTypes: [],
      isStatic: mods.isStatic,
      isFinal: mods.isFinal,
      typeName: parsed?.typeName ?? (sym.detail || undefined),
      isEnumConstant: sym.kind === SymbolKind.EnumMember,
    };
    if (member.isEnumConstant) {
      parent.enumConstants.push(member.name);
    }
    parent.fields.push(member);
    return;
  }

  // 其他类型符号（Package/Module/Namespace 等）：跳过自身但下钻子节点
  for (const child of sym.children ?? []) {
    convertSymbol(child, document, parent, types);
  }
}

/** DocumentSymbol.detail 形如 `name(String, int): void` */
function fallbackParamsFromDetail(detail?: string): string[] {
  if (!detail) {
    return [];
  }
  const open = detail.indexOf('(');
  const close = detail.lastIndexOf(')');
  if (open < 0 || close <= open) {
    return [];
  }
  return detail
    .slice(open + 1, close)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 尝试通过 DocumentSymbol 构建 model；无符号（未装 redhat.java 等）返回 null */
export async function buildModelFromSymbols(document: TextDocument): Promise<JavaFileModel | null> {
  let symbols: DocumentSymbol[] | undefined;
  try {
    symbols = await vscode.commands.executeCommand<DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri);
  } catch {
    return null;
  }
  if (!symbols || symbols.length === 0) {
    return null;
  }
  const types: TypeDecl[] = [];
  for (const sym of symbols) {
    convertSymbol(sym, document, null, types);
  }
  if (types.length === 0) {
    return null;
  }
  const pkgMatch = /package\s+([\w.]+)\s*;/.exec(document.getText());
  return { packageName: pkgMatch ? pkgMatch[1] : '', types };
}
