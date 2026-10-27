/**
 * 轻量 Java 文本解析器（兜底路径 + 符号路径共用工具）。
 * 当 redhat.java 未安装/未激活（无 DocumentSymbol）时，用文本方式解析出
 * package / 类嵌套 / 方法 / 字段 / 枚举常量，供上下文分析使用。
 * 尽力而为（best-effort）：不处理局部类、匿名类内部声明等复杂场景。
 */
import { JavaFileModel, MemberDecl, TypeDecl, TypeKind } from './model';

/** 将注释、字符串、字符字面量内容替换为空格，保留换行与结构字符 */
export function maskJavaText(text: string): string {
  const arr = text.split('');
  const n = text.length;
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'str' | 'chr' = 'code';
  while (i < n) {
    const c = text[i];
    const c2 = i + 1 < n ? text[i + 1] : '';
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        state = 'line';
        arr[i] = ' ';
        arr[i + 1] = ' ';
        i += 2;
      } else if (c === '/' && c2 === '*') {
        state = 'block';
        arr[i] = ' ';
        arr[i + 1] = ' ';
        i += 2;
      } else if (c === '"') {
        state = 'str';
        arr[i] = ' ';
        i++;
      } else if (c === "'") {
        state = 'chr';
        arr[i] = ' ';
        i++;
      } else {
        i++;
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code';
      } else {
        arr[i] = ' ';
      }
      i++;
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') {
        state = 'code';
        arr[i] = ' ';
        arr[i + 1] = ' ';
        i += 2;
      } else {
        if (c !== '\n') {
          arr[i] = ' ';
        }
        i++;
      }
    } else {
      // str / chr
      if (c === '\\' && c2) {
        arr[i] = ' ';
        arr[i + 1] = ' ';
        i += 2;
      } else if ((state === 'str' && c === '"') || (state === 'chr' && c === "'")) {
        state = 'code';
        arr[i] = ' ';
        i++;
      } else {
        arr[i] = ' ';
        i++;
      }
    }
  }
  return arr.join('');
}

const MODIFIER_RE = /\b(public|private|protected|static|final|abstract|synchronized|native|transient|volatile|strictfp|default|sealed|non-sealed)\b/g;

const TYPE_KEYWORD_RE = /\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;

const METHOD_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'new',
  'do', 'try', 'else', 'assert', 'throw', 'super', 'this', 'case',
]);

const RESERVED_WORDS = new Set([
  ...METHOD_KEYWORDS, 'public', 'private', 'protected', 'static', 'final',
  'abstract', 'native', 'transient', 'volatile', 'strictfp', 'default',
  'class', 'interface', 'enum', 'record', 'package', 'import', 'new',
]);

const ANNOTATION_PREFIX_RE = /^@[\w$.]+\s*(\([^()]*\))?\s*/;

/** 按顶层分隔符切分（忽略 <> 与 () 内部的分隔符） */
export function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let angle = 0;
  let paren = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '<') {
      angle++;
    } else if (ch === '>') {
      angle--;
    } else if (ch === '(') {
      paren++;
    } else if (ch === ')') {
      paren--;
    }
    if (ch === sep && angle === 0 && paren === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) {
    out.push(cur);
  }
  return out;
}

/** 从方法/构造声明文本中提取参数类型列表，例如 `foo(String a, Map<String,Integer> b)` → ['String','Map'] */
export function parseParamTypes(declText: string): string[] {
  const open = declText.indexOf('(');
  if (open < 0) {
    return [];
  }
  let depth = 0;
  let close = -1;
  for (let i = open; i < declText.length; i++) {
    if (declText[i] === '(') {
      depth++;
    } else if (declText[i] === ')') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) {
    return [];
  }
  const inner = declText.slice(open + 1, close).trim();
  if (!inner) {
    return [];
  }
  const types: string[] = [];
  for (const partRaw of splitTopLevel(inner, ',')) {
    let part = partRaw.trim();
    part = part.replace(/^final\s+/, '');
    part = part.replace(ANNOTATION_PREFIX_RE, '').trim();
    if (!part) {
      continue;
    }
    // 去掉泛型实参后取“类型 部分”（最后一个标识符是形参名）
    const noGeneric = part.replace(/<[^<>]*>/g, ' ');
    const m = noGeneric.match(/^(.*?)\s*([A-Za-z_$][\w$]*)\s*$/);
    if (!m || !m[1].trim()) {
      continue; // 解析不出来就跳过，best-effort
    }
    const start = part.indexOf(m[2].trim());
    let type = start > 0 ? part.slice(0, start).trim() : m[1].trim();
    type = type.replace(/\.\.\./g, '[]').replace(/\s+/g, '');
    types.push(type);
  }
  return types;
}

/** 从字段声明片段解析 `类型 名称`（去掉修饰符/注解/初始化） */
export function parseFieldTypeName(declText: string): { typeName: string; name: string } | null {
  let seg = declText.trim();
  while (true) {
    const before = seg;
    seg = seg.replace(ANNOTATION_PREFIX_RE, '');
    if (seg === before) {
      break;
    }
  }
  const eq = seg.indexOf('=');
  if (eq >= 0) {
    seg = seg.slice(0, eq);
  }
  const semi = seg.indexOf(';');
  if (semi >= 0) {
    seg = seg.slice(0, semi);
  }
  // 同一行多字段只取第一个
  seg = splitTopLevel(seg, ',')[0] ?? '';
  seg = seg.replace(MODIFIER_RE, ' ').replace(/\s+/g, ' ').trim();
  const m = seg.match(/^((?:[A-Za-z_$][\w$.]*)(?:<[^<>]*>)?(?:\s*\[\s*\])*)\s+([A-Za-z_$][\w$]*)$/);
  if (!m) {
    return null;
  }
  return { typeName: m[1].replace(/\s+/g, ''), name: m[2] };
}

function stripAnnotations(seg: string): string {
  let s = seg.trim();
  while (true) {
    const before = s;
    s = s.replace(ANNOTATION_PREFIX_RE, '');
    if (s === before) {
      break;
    }
  }
  return s.trim();
}

interface TypeFrameExt {
  frameKind: 'type';
  typeDecl: TypeDecl;
  enumPhase: boolean;
}

interface PendingType {
  name: string;
  kind: TypeKind;
  declLine: number;
}

interface PendingMethod {
  name: string;
  paramTypes: string[];
  isStatic: boolean;
  isFinal: boolean;
  declLine: number;
}

/** detectInSegment 的返回：新识别出的待挂接声明（挂到后续 '{' 上） */
interface SegmentResult {
  pendingType?: PendingType;
  pendingMethod?: PendingMethod;
  /** 进入跨行签名收集 */
  signatureBuffer?: string;
}

interface MemberFrame {
  frameKind: 'member';
  member: MemberDecl;
}

/**
 * 解析 Java 文本为结构模型。
 */
export function parseJavaText(rawText: string): JavaFileModel {
  const masked = maskJavaText(rawText);
  const pkgMatch = /package\s+([\w.]+)\s*;/.exec(masked);
  const packageName = pkgMatch ? pkgMatch[1] : '';

  const lines = masked.split('\n');
  const types: TypeDecl[] = [];
  // 栈元素：类型帧 / 方法体帧 / 其他块帧（匿名类、初始化块、控制流块）
  const stack: Array<{ frameKind: 'root' | 'other' } | TypeFrameExt | MemberFrame> = [{ frameKind: 'root' }];

  let pendingType: PendingType | null = null;
  let pendingMethod: PendingMethod | null = null;
  let signatureBuffer: string | null = null;

  const top = () => stack[stack.length - 1];
  const currentTypeFrame = (): TypeFrameExt | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].frameKind === 'type') {
        return stack[i] as TypeFrameExt;
      }
    }
    return undefined;
  };

  const addMember = (decl: MemberDecl, typeFrame: TypeFrameExt | undefined): void => {
    const target = typeFrame?.typeDecl;
    if (!target) {
      return;
    }
    if (decl.isEnumConstant) {
      target.enumConstants.push(decl.name);
    }
    target.fields.push(decl);
  };

  const addMethod = (decl: MemberDecl, typeFrame: TypeFrameExt | undefined): void => {
    const target = typeFrame?.typeDecl;
    if (target) {
      target.methods.push(decl);
    }
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let segStart = 0;

    for (let col = 0; col <= line.length; col++) {
      const ch = col < line.length ? line[col] : '\n';
      if (ch !== '{' && ch !== '}' && col < line.length) {
        continue;
      }
      const seg = line.slice(segStart, col);
      const tf = currentTypeFrame();
      const memberLevel = top().frameKind === 'type' || top().frameKind === 'root';

      // 1) 跨行签名收集
      if (signatureBuffer !== null) {
        signatureBuffer += ' ' + seg;
        if (signatureBuffer.includes(')')) {
          const finished = finishMethod(signatureBuffer, lineIdx);
          signatureBuffer = null;
          if (finished) {
            if (restHasOpenBrace(line, col) || !finished.hasTerminator) {
              pendingMethod = finished.pending;
            } else {
              // abstract / interface 方法，无方法体
              addMethod(
                { name: finished.pending.name, declLine: finished.pending.declLine, endLine: lineIdx,
                  paramTypes: finished.pending.paramTypes, isStatic: finished.pending.isStatic, isFinal: finished.pending.isFinal },
                tf,
              );
            }
          }
        }
      } else if (seg.trim() && memberLevel) {
        const r = detectInSegment(seg, lineIdx, tf, col, line);
        if (r?.pendingType !== undefined) {
          pendingType = r.pendingType;
        } else if (r?.pendingMethod !== undefined) {
          pendingMethod = r.pendingMethod;
        } else if (r?.signatureBuffer !== undefined) {
          signatureBuffer = r.signatureBuffer;
        }
      }

      // 2) 花括号帧处理
      if (ch === '{') {
        if (pendingType) {
          const decl: TypeDecl = {
            kind: pendingType.kind,
            name: pendingType.name,
            declLine: pendingType.declLine,
            bodyStartLine: lineIdx,
            bodyEndLine: lineIdx,
            methods: [], fields: [], enumConstants: [], children: [],
          };
          const parent = currentTypeFrame();
          const frame: TypeFrameExt = { frameKind: 'type', typeDecl: decl, enumPhase: decl.kind === 'enum' };
          stack.push(frame);
          if (parent) {
            parent.typeDecl.children.push(decl);
          } else {
            types.push(decl);
          }
          pendingType = null;
        } else if (pendingMethod) {
          const frame: MemberFrame = {
            frameKind: 'member',
            member: {
              name: pendingMethod.name, declLine: pendingMethod.declLine, endLine: lineIdx,
              paramTypes: pendingMethod.paramTypes, isStatic: pendingMethod.isStatic, isFinal: pendingMethod.isFinal,
            },
          };
          stack.push(frame);
          addMethod(frame.member, currentTypeFrame());
          pendingMethod = null;
        } else {
          stack.push({ frameKind: 'other' });
        }
      } else if (ch === '}') {
        if (stack.length > 1) {
          const popped = stack.pop()!;
          if (popped.frameKind === 'type') {
            popped.typeDecl.bodyEndLine = lineIdx;
          } else if (popped.frameKind === 'member') {
            popped.member.endLine = lineIdx;
          }
        }
      }
      segStart = col + 1;
    }
  }

  function restHasOpenBrace(line: string, from: number): boolean {
    return line.slice(from).includes('{');
  }

  interface FinishedMethod {
    pending: PendingMethod;
    /** ')' 之后是否有 ';'（无方法体声明） */
    hasTerminator: boolean;
  }

  function finishMethod(text: string, lineIdx: number): FinishedMethod | null {
    const m = /([A-Za-z_$][\w$]*)\s*\(/.exec(text);
    if (!m || METHOD_KEYWORDS.has(m[1]) || RESERVED_WORDS.has(m[1])) {
      return null;
    }
    if (text.slice(0, m.index).includes('=')) {
      return null; // 是方法调用赋值，不是声明
    }
    const closeIdx = text.indexOf(')', m.index + m[1].length);
    const after = text.slice(closeIdx + 1);
    const pending: PendingMethod = {
      name: m[1],
      paramTypes: parseParamTypes(text),
      isStatic: /\bstatic\b/.test(text.slice(0, m.index)),
      isFinal: /\bfinal\b/.test(text.slice(0, m.index)),
      declLine: lineIdx,
    };
    return { pending, hasTerminator: after.includes(';') };
  }

  function detectInSegment(seg: string, lineIdx: number, tf: TypeFrameExt | undefined, col: number, line: string): SegmentResult | null {
    const stripped = stripAnnotations(seg);

    // 枚举常量
    if (tf && tf.enumPhase) {
      let sawSemi = false;
      for (const token of splitTopLevel(stripped.replace(/;/g, () => { sawSemi = true; return ','; }), ',')) {
        const tk = token.trim();
        if (!tk) {
          continue;
        }
        const cm = /^([A-Za-z_$][\w$]*)\s*(\(.*\))?$/.exec(tk);
        if (cm && !RESERVED_WORDS.has(cm[1])) {
          addMember({
            name: cm[1], declLine: lineIdx, endLine: lineIdx,
            paramTypes: [], isStatic: true, isFinal: true,
            typeName: tf.typeDecl.name, isEnumConstant: true,
          }, tf);
        }
      }
      if (sawSemi) {
        tf.enumPhase = false;
      }
      // 常量行不再做其他识别
      if (/^[A-Za-z_$][\w$]*(\s*\(.*\))?([,;]|$)/.test(stripped)) {
        return null;
      }
    }

    // 注解行：跳过（保留已有的 pendingMethod/pendingType 等待 '{'）
    if (/^@/.test(seg.trim())) {
      return null;
    }

    // 类型声明
    const tm = TYPE_KEYWORD_RE.exec(stripped);
    if (tm && (tm.index === 0 || stripped[tm.index - 1] !== '.')) {
      const before = stripped.slice(0, tm.index).replace(MODIFIER_RE, ' ').trim();
      if (!before || /^[\w$.\s]+$/.test(before)) {
        return { pendingType: { name: tm[2], kind: tm[1] as TypeKind, declLine: lineIdx } };
      }
    }

    if (!tf || top().frameKind !== 'type') {
      return null;
    }

    // 方法声明：标识符 + '('，且前面没有 '='
    const mm = /([A-Za-z_$][\w$]*)\s*\(/.exec(stripped);
    if (mm && !METHOD_KEYWORDS.has(mm[1]) && !RESERVED_WORDS.has(mm[1]) && !stripped.slice(0, mm.index).includes('=')) {
      if (!stripped.includes(')', mm.index + mm[1].length)) {
        return { signatureBuffer: stripped };
      }
      const finished = finishMethod(stripped, lineIdx);
      if (!finished) {
        return null;
      }
      const braceLater = line.slice(col).includes('{') || /^\s*\{/.test(lines[lineIdx + 1] ?? '');
      if (finished.hasTerminator && !braceLater && !line.slice(0, col + seg.length).includes('{')) {
        addMethod(
          { name: finished.pending.name, declLine: lineIdx, endLine: lineIdx,
            paramTypes: finished.pending.paramTypes, isStatic: finished.pending.isStatic, isFinal: finished.pending.isFinal },
          tf,
        );
        return null;
      }
      return { pendingMethod: finished.pending };
    }

    // 字段声明
    const fieldInfo = parseFieldTypeName(stripped);
    if (fieldInfo) {
      addMember({
        name: fieldInfo.name, declLine: lineIdx, endLine: lineIdx,
        paramTypes: [], isStatic: /\bstatic\b/.test(stripped), isFinal: /\bfinal\b/.test(stripped),
        typeName: fieldInfo.typeName,
      }, tf);
    }
    return null;
  }

  return { packageName, types };
}
