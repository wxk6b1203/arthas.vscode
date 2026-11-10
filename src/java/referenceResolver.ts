/**
 * 光标引用解析（对应 IDEA 的 PSI_ELEMENT 引用解析）。
 *
 * VSCode 没有直接暴露“光标处 PSI 元素”，但 Java 语言服务提供了
 * `vscode.executeDefinitionProvider`：光标在 `AppContextUtil.getBean(...)` 的
 * `getBean` 上时会返回 `AppContextUtil#getBean` 的声明位置。本模块只负责把
 * Location / LocationLink 的多种返回形态归一化，并挑出工作区内的 Java 源码目标；
 * 具体打开文件、重建上下文由扩展层完成。
 */
import type { Uri } from 'vscode';

export interface DefinitionRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface DefinitionTarget {
  uri: Uri;
  range: DefinitionRange;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPosition(v: unknown): v is { line: number; character: number } {
  return (
    isObject(v) &&
    typeof v.line === 'number' &&
    typeof v.character === 'number' &&
    Number.isInteger(v.line) &&
    Number.isInteger(v.character) &&
    v.line >= 0 &&
    v.character >= 0
  );
}

function isRange(v: unknown): v is DefinitionRange {
  return isObject(v) && isPosition(v.start) && isPosition(v.end);
}

/** Location 或 LocationLink → 统一目标；无法识别时返回 null */
function toTarget(raw: unknown): DefinitionTarget | null {
  if (!isObject(raw)) {
    return null;
  }
  // vscode.Location
  if (raw.uri && isRange(raw.range)) {
    return { uri: raw.uri as Uri, range: raw.range };
  }
  // vscode.LocationLink：优先 targetSelectionRange（声明名本身），否则 targetRange
  if (raw.targetUri && (isRange(raw.targetSelectionRange) || isRange(raw.targetRange))) {
    return {
      uri: raw.targetUri as Uri,
      range: (raw.targetSelectionRange ?? raw.targetRange) as DefinitionRange,
    };
  }
  return null;
}

/**
 * 归一化 `vscode.executeDefinitionProvider` 的返回值：
 * 可能是 Location、Location[]，或 LocationLink[]。
 */
export function normalizeDefinitions(result: unknown): DefinitionTarget[] {
  if (result === undefined || result === null) {
    return [];
  }
  const list = Array.isArray(result) ? result : [result];
  const targets: DefinitionTarget[] = [];
  for (const item of list) {
    const target = toTarget(item);
    if (target) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * 从定义结果中挑出第一个工作区 Java 源码目标。
 * JDK / 依赖库内的定义（jdt://、jar 内条目等）不参与：
 * watch 到 java.* 没有意义，保留“光标在方法体内即视为当前方法”的既有兜底。
 */
export function pickWorkspaceDefinition(
  result: unknown,
  isWorkspaceJavaFile: (uri: Uri) => boolean,
): DefinitionTarget | null {
  for (const target of normalizeDefinitions(result)) {
    const path = target.uri.path.toLowerCase();
    // 跳过 jdt://、jar 内条目等非磁盘源码（部分语言服务仍会给出 .java 后缀）
    if (target.uri.scheme === 'jdt' || path.includes('!') || path.includes('.jar')) {
      continue;
    }
    if (!path.endsWith('.java')) {
      continue;
    }
    if (isWorkspaceJavaFile(target.uri)) {
      return target;
    }
  }
  return null;
}
