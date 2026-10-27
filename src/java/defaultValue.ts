/**
 * 参数/字段类型 → OGNL 默认值字面量。
 * 移植自 arthas-idea-plugin 的 OgnlPsUtils#getDefaultString / PsiToolkit。
 */

/** 集合/Map 元素、未知对象类型的默认值 */
export const OBJECT_DEFAULT = '(#p=null,#p)';
export const DEFAULT_MAP_KEY = 'test';

/** 归一化类型名：去泛型/数组/空格 */
export function normalizeTypeName(type: string): { base: string; array: boolean } {
  let t = type.trim().replace(/\s+/g, '');
  let array = false;
  while (t.endsWith('[]')) {
    array = true;
    t = t.slice(0, -2);
  }
  const generic = t.indexOf('<');
  if (generic >= 0) {
    t = t.slice(0, generic);
  }
  return { base: t, array };
}

const PRIMITIVE_DEFAULTS: Record<string, string> = {
  'boolean': 'true', 'Boolean': 'true',
  'char': "'c'", 'Character': "'c'",
  'byte': '0', 'Byte': '0',
  'short': '0', 'Short': '0',
  'int': '0', 'Integer': '0',
  'long': '0L', 'Long': '0L',
  'float': '0F', 'Float': '0F',
  'double': '0D', 'Double': '0D',
  'String': '" "', 'CharSequence': '" "',
};

const SIMPLE_DEFAULTS: Record<string, string> = {
  'BigDecimal': '(#p=@java.math.BigDecimal@valueOf(1L),#p)',
  'BigInteger': '(#p=@java.math.BigInteger@valueOf(1),#p)',
  'Date': '(#p=new java.util.Date(),#p)',
  'LocalDateTime': '(#p=@java.time.LocalDateTime@now(),#p)',
  'LocalDate': '(#p=@java.time.LocalDate@now(),#p)',
  'LocalTime': '(#p=@java.time.LocalTime@now(),#p)',
  'Instant': '(#p=@java.time.Instant@now(),#p)',
  'ZonedDateTime': '(#p=@java.time.ZonedDateTime@now(),#p)',
  'StringBuilder': '(#p=new java.lang.StringBuilder(),#p)',
  'StringBuffer': '(#p=new java.lang.StringBuffer(),#p)',
  'AtomicBoolean': '(#p=new java.util.concurrent.atomic.AtomicBoolean(true),#p)',
  'AtomicInteger': '(#p=new java.util.concurrent.atomic.AtomicInteger(0),#p)',
  'AtomicLong': '(#p=new java.util.concurrent.atomic.AtomicLong(0),#p)',
  'Optional': OBJECT_DEFAULT,
  'Object': OBJECT_DEFAULT,
  'void': '', 'Void': '',
};

const LIST_TYPES = new Set(['List', 'ArrayList', 'Collection', 'Iterable', 'Queue', 'Deque']);
const LINKED_LIST_TYPES = new Set(['LinkedList', 'Vector', 'Stack', 'CopyOnWriteArrayList', 'ArrayDeque', 'PriorityQueue']);
const SET_TYPES = new Set(['Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'SortedSet', 'CopyOnWriteArraySet']);
const MAP_TYPES = new Set(['Map', 'HashMap', 'LinkedHashMap', 'TreeMap', 'Hashtable', 'ConcurrentHashMap', 'ConcurrentMap', 'EnumMap', 'WeakHashMap', 'Properties', 'SortedMap', 'NavigableMap']);

export interface EnumResolver {
  /** 类型简单名 → 枚举 FQN（用于 @Fqn@FIRST 默认值），不存在返回 undefined */
  (typeName: string): string | undefined;
}

/**
 * 生成类型对应的 OGNL 默认值。
 * @param type 类型名（简单名或全限定名，可含泛型/数组）
 * @param resolveEnum 可选：同文件枚举解析器
 */
export function defaultOgnlValue(type: string, resolveEnum?: EnumResolver): string {
  const { base, array } = normalizeTypeName(type);
  if (!base) {
    return OBJECT_DEFAULT;
  }
  const simple = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : base;

  if (array) {
    // 基本类型/字符串数组给一个带初值的元素，其余给空数组
    const elem = PRIMITIVE_DEFAULTS[simple];
    if (elem !== undefined) {
      return `new ${base}[]{${elem}}`;
    }
    return `new ${base}[]{}`;
  }

  if (PRIMITIVE_DEFAULTS[simple] !== undefined && (base === simple || base.startsWith('java.'))) {
    return PRIMITIVE_DEFAULTS[simple];
  }
  if (SIMPLE_DEFAULTS[simple] !== undefined && (base === simple || base.startsWith('java.'))) {
    return SIMPLE_DEFAULTS[simple];
  }

  // Class<X> → (@X@class)
  if (simple === 'Class') {
    const genericMatch = /<\s*([\w$.]+)\s*>/.exec(type);
    if (genericMatch) {
      return `(@${genericMatch[1]}@class)`;
    }
    return '(@java.lang.Object@class)';
  }

  // 同文件枚举 → @Fqn@FIRST
  if (resolveEnum) {
    const enumFqn = resolveEnum(base);
    if (enumFqn) {
      return `@${enumFqn}@FIRST`;
    }
  }

  if (LIST_TYPES.has(simple)) {
    return `(#list=new java.util.ArrayList(),#list.add(${OBJECT_DEFAULT}),#list)`;
  }
  if (LINKED_LIST_TYPES.has(simple)) {
    return `(#list=new java.util.LinkedList(),#list.add(${OBJECT_DEFAULT}),#list)`;
  }
  if (SET_TYPES.has(simple)) {
    return `(#set=new java.util.HashSet(),#set.add(${OBJECT_DEFAULT}),#set)`;
  }
  if (MAP_TYPES.has(simple)) {
    if (simple === 'Map' || simple === 'HashMap') {
      return `(#{"${DEFAULT_MAP_KEY}": ${OBJECT_DEFAULT}})`;
    }
    const fq = simple === 'Properties' || simple === 'Hashtable' ? 'java.util.Hashtable' : `java.util.${simple}`;
    return `(#@${fq}@{"${DEFAULT_MAP_KEY}": ${OBJECT_DEFAULT}})`;
  }

  // 简单名（非 java.*）：尝试 String/包装类等常见简写
  if (PRIMITIVE_DEFAULTS[simple] !== undefined) {
    return PRIMITIVE_DEFAULTS[simple];
  }
  return OBJECT_DEFAULT;
}

/** 方法参数类型列表 → `p1,p2,...` 默认实参串 */
export function defaultParamsString(paramTypes: string[], resolveEnum?: EnumResolver): string {
  return paramTypes.map((t) => defaultOgnlValue(t, resolveEnum)).filter((s) => s !== '').join(',');
}
