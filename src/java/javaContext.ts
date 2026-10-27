/**
 * 上下文解析：JavaFileModel + 光标位置 → JavaContext。
 * 等价 arthas-idea-plugin 的 OgnlPsUtils 判定集合。
 */
import { JavaContext, JavaFileModel, MemberDecl, TypeDecl } from './model';
import { beanNameFromAnnotations } from './springUtils';
import { defaultOgnlValue } from './defaultValue';
import { maskJavaText } from './textParser';

export interface ResolveInput {
  text: string;
  fileName: string;
  /** 0 基行号 */
  line: number;
  /** 0 基列号 */
  character: number;
  model: JavaFileModel;
}

/** 找到包含光标行的最内层类型（返回从外到内的链） */
function findTypeChain(types: TypeDecl[], line: number, chain: TypeDecl[] = []): TypeDecl[] {
  for (const t of types) {
    if (line >= t.declLine && line <= t.bodyEndLine) {
      const childChain = findTypeChain(t.children, line, [...chain, t]);
      if (childChain.length > chain.length) {
        return childChain;
      }
      return [...chain, t];
    }
  }
  return chain;
}

const ANONYMOUS_NEW_RE = /\bnew\s+[\w.$]+\s*(\([^()]*\))?\s*\{/g;

/** 光标是否处于某个匿名类体内 → 匿名类容器类名 com.a.Foo*$* 的判定基础 */
export function findAnonymousContainer(maskedText: string, offset: number): boolean {
  ANONYMOUS_NEW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANONYMOUS_NEW_RE.exec(maskedText)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    if (openBrace <= offset) {
      // 括号匹配找到块结束
      let depth = 0;
      for (let i = openBrace; i < maskedText.length; i++) {
        const c = maskedText[i];
        if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
          if (depth === 0) {
            if (offset < i) {
              return true;
            }
            break;
          }
        }
      }
    }
    // 性能保护：跳过太远的匹配
    if (m.index > offset) {
      break;
    }
  }
  return false;
}

/** 类/成员声明上方连续注解行（原始文本）。
 * 符号路径下 declLine 可能落在注解块首行（redhat.java 的 range 起始于首个注解），
 * 此时先向下补齐同一注解块内的其余注解行（到声明行为止），再向上继续收集。 */
function annotationsAbove(lines: string[], declLine: number): string[] {
  const out: string[] = [];
  for (let i = declLine; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (t.startsWith('@')) {
      out.push(lines[i]);
      continue;
    }
    if (t.startsWith('(') || t.startsWith(')')) {
      continue; // 多行注解参数续行
    }
    break; // 声明行（或空行）为止
  }
  for (let i = declLine - 1; i >= 0; i--) {
    const t = (lines[i] ?? '').trim();
    if (!t) {
      continue;
    }
    if (t.startsWith('@')) {
      out.unshift(lines[i]);
      // 多行注解参数（以 ( 开头延续）向上再找
      continue;
    }
    if (t.startsWith(')') || t.startsWith('(')) {
      continue;
    }
    break;
  }
  return out;
}

/** 构建“类型简单名 → 枚举 FQN”解析器（同文件枚举，供默认值 @Fqn@FIRST 用） */
export function buildEnumResolver(model: JavaFileModel): (simpleName: string) => string | undefined {
  const enumTypes = new Map<string, string>();
  const collectEnums = (types: TypeDecl[], prefix: string): void => {
    for (const t of types) {
      const fqn = prefix ? `${prefix}$${t.name}` : (model.packageName ? `${model.packageName}.${t.name}` : t.name);
      if (t.kind === 'enum') {
        enumTypes.set(t.name, fqn);
      }
      collectEnums(t.children, fqn);
    }
  };
  collectEnums(model.types, '');
  return (simpleName: string) => enumTypes.get(simpleName);
}

const LOMBOK_NONE_RE = /AccessLevel\s*\.\s*NONE/;

/**
 * Lombok 注解推断：类/字段注解是否意味着存在 setXxx 方法。
 * - 字段级 @Setter 优先（AccessLevel.NONE 表示不生成）
 * - 类级 @Data / @Setter 生成全部 setter；@Value 只有 getter；
 *   @Accessors(fluent = true) 生成的方法名不带 set 前缀
 */
export function lombokSetterExists(fieldAnnotations: string[], classAnnotations: string[]): boolean {
  const fieldSetter = fieldAnnotations.find((a) => /^@(lombok\.)?Setter\b/.test(a.trim()));
  if (fieldSetter) {
    return !LOMBOK_NONE_RE.test(fieldSetter);
  }
  const classGenerates = classAnnotations.some(
    (a) => /^@(lombok\.)?(Data|Setter)\b/.test(a.trim()) && !LOMBOK_NONE_RE.test(a),
  );
  if (!classGenerates) {
    return false;
  }
  return !classAnnotations.some((a) => {
    const t = a.trim();
    if (/^@(lombok\.)?Value\b/.test(t)) {
      return true;
    }
    return /^@(lombok\.)?Accessors\b/.test(t) && /fluent\s*=\s*true/.test(t);
  });
}

/**
 * 解析光标处上下文。返回 null 表示无法识别（例如不在任何类型内）。
 */
export function resolveContext(input: ResolveInput): JavaContext | null {
  const { text, fileName, line, model } = input;
  const lines = text.split('\n');
  const fileBaseName = fileName.replace(/\.java$/, '');

  const chain = findTypeChain(model.types, line);
  if (chain.length === 0) {
    return null;
  }
  const innermost = chain[chain.length - 1];

  // 匿名类：光标处于 new Xxx(){...} 体内（用掩码文本避免字符串/注释误报）
  let isAnonymous = false;
  try {
    const masked = maskJavaText(text);
    const offset = lines.slice(0, line).reduce((acc, l) => acc + l.length + 1, 0) + input.character;
    isAnonymous = findAnonymousContainer(masked, offset);
  } catch {
    isAnonymous = false;
  }

  const className = isAnonymous
    ? `${model.packageName ? model.packageName + '.' : ''}${fileBaseName}*$*`
    : `${model.packageName ? model.packageName + '.' : ''}${chain.map((t) => t.name).join('$')}`;

  // 成员判定：方法（声明行..方法体结束行），字段/枚举常量（声明行..range 末行，
  // redhat.java 下含注解的字段 range 起始于注解行）
  let method: MemberDecl | undefined;
  for (const m of innermost.methods) {
    if (line >= m.declLine && line <= m.endLine) {
      method = m;
      break;
    }
  }
  let field: MemberDecl | undefined;
  for (const f of innermost.fields) {
    if (line >= f.declLine && line <= f.endLine) {
      field = f;
      break;
    }
  }

  const isEnumClass = innermost.kind === 'enum';
  const firstEnumConstant = innermost.enumConstants.length > 0 ? innermost.enumConstants[0] : undefined;

  let kind: JavaContext['kind'];
  let name: string;
  let member: MemberDecl | undefined;
  if (field && !method) {
    member = field;
    kind = field.isEnumConstant ? 'enum-constant' : 'field';
    name = field.name;
  } else if (method) {
    member = method;
    kind = 'method';
    name = method.name;
  } else {
    kind = 'class';
    name = innermost.name;
  }

  const isConstructor = kind === 'method' && method !== undefined && method.name === innermost.name;

  const classAnnotations = annotationsAbove(lines, innermost.declLine);

  // setter 检测：显式声明的方法，或 Lombok 注解推断（@Data/@Setter 等）
  let hasSetter = false;
  if (kind === 'field') {
    const setterName = 'set' + field!.name.charAt(0).toUpperCase() + field!.name.slice(1);
    hasSetter =
      innermost.methods.some((m) => m.name === setterName) ||
      lombokSetterExists(annotationsAbove(lines, field!.declLine), classAnnotations);
  }

  const springBeanName = beanNameFromAnnotations(classAnnotations, innermost.name);

  const methodName = isConstructor ? '<init>' : kind === 'method' ? method!.name : '*';

  const fieldTypeName = kind === 'field' || kind === 'enum-constant' ? field!.typeName : undefined;

  const ctx: JavaContext = {
    packageName: model.packageName,
    fileBaseName,
    className,
    kind,
    name,
    methodName,
    isConstructor,
    isStatic: kind === 'method' ? !!method!.isStatic : kind === 'field' ? !!field!.isStatic : false,
    isFinal: kind === 'method' ? !!method!.isFinal : kind === 'field' ? !!field!.isFinal : false,
    isEnumClass,
    isAnonymous,
    isInnerClass: chain.length > 1,
    memberClassSimpleName: innermost.name,
    methodParamTypes: kind === 'method' ? method!.paramTypes : [],
    firstEnumConstant,
    hasSetter,
    fieldTypeName,
    springBeanName,
  };
  if (kind === 'enum-constant') {
    ctx.enumConstantName = field!.name;
    // 枚举常量隐含 static final
    ctx.isStatic = true;
    ctx.isFinal = true;
  }
  return ctx;
}

/** 字段/方法参数的 OGNL 默认值（EXECUTE_INFO / DEFAULT_FIELD_VALUE 使用） */
export function fieldDefaultValue(ctx: JavaContext, resolveEnum?: (n: string) => string | undefined): string {
  if (ctx.kind !== 'field' && ctx.kind !== 'enum-constant') {
    return '';
  }
  return defaultOgnlValue(ctx.fieldTypeName ?? '', resolveEnum);
}
