/**
 * 主路径：借助 redhat.java（Language Support for Java）的 DocumentSymbol
 * 构建与文本解析器相同结构的 JavaFileModel。
 */
import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind, TextDocument } from 'vscode';
import { JavaFileModel, MemberDecl, TypeDecl, TypeKind } from './model';
import { maskJavaText, parseFieldTypeName, parseParamTypes, cleanMemberName } from './textParser';

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

/** 类型名转义后用于源码声明匹配（类名可含 $） */
function escapeNameForRegex(name: string): string {
  return name.replace(/[$]/g, '\\$');
}

/**
 * 判断类型是否真实声明于源码：lombok @Builder 会让 jdt.ls 报出无源码的合成嵌套类
 * （如 FooBuilder，range 收缩到注解行），这类符号不应参与光标上下文判定。
 */
function isDeclaredInSource(document: TextDocument, name: string, startLine: number, endLine: number): boolean {
  const re = new RegExp(`\\b(?:class|interface|enum|record)\\s+${escapeNameForRegex(name)}\\b`);
  for (let l = startLine; l <= endLine && l < document.lineCount; l++) {
    if (re.test(document.lineAt(l).text)) {
      return true;
    }
  }
  return false;
}

/** 读取声明行原始文本（跨行取到 ')' 或 ';' 为止）再遮蔽字符串/注释，用于修饰符/签名解析 */
function declText(document: TextDocument, startLine: number): string {
  const parts: string[] = [];
  for (let l = startLine; l < Math.min(startLine + 5, document.lineCount); l++) {
    const t = document.lineAt(l).text;
    parts.push(t);
    if (/[;{]/.test(t)) {
      break;
    }
  }
  // 遮蔽字符串/注释内容，避免其中出现的 static/final/;/= 等干扰修饰符与签名解析
  return maskJavaText(parts.join(' '));
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
    if (!isDeclaredInSource(document, sym.name, startLine, endLine)) {
      // lombok @Builder 等生成的合成类型（源码中无 class/interface/enum/record 声明）：忽略
      return;
    }
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
      name: cleanMemberName(sym.name),
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
      // 含注解的字段 range 起始于注解行、结束于声明行，保留完整区间供光标匹配
      endLine: endLine,
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

/** redhat.java 预热期间符号请求可能长时间挂起，超时后立即退回文本解析 */
const SYMBOL_TIMEOUT_MS = 500;

function withTimeout<T>(p: Thenable<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export interface SymbolResult {
  /** 无符号（未装 redhat.java / 非 java 项目）时为 null */
  model: JavaFileModel | null;
  /** 符号请求超时（jdt.ls 预热中），调用方不应缓存兜底结果以便稍后重试 */
  timedOut: boolean;
}

/** 尝试通过 DocumentSymbol 构建 model */
export async function buildModelFromSymbols(document: TextDocument): Promise<SymbolResult> {
  let symbols: DocumentSymbol[] | null | undefined;
  try {
    symbols = await withTimeout(
      vscode.commands.executeCommand<DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri),
      SYMBOL_TIMEOUT_MS,
    );
  } catch {
    return { model: null, timedOut: false };
  }
  if (symbols === null) {
    return { model: null, timedOut: true };
  }
  if (!symbols || symbols.length === 0) {
    return { model: null, timedOut: false };
  }
  const types: TypeDecl[] = [];
  for (const sym of symbols) {
    convertSymbol(sym, document, null, types);
  }
  if (types.length === 0) {
    return { model: null, timedOut: false };
  }
  const pkgMatch = /package\s+([\w.]+)\s*;/.exec(document.getText());
  return { model: { packageName: pkgMatch ? pkgMatch[1] : '', types }, timedOut: false };
}
