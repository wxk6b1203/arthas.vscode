/**
 * Java 源码结构模型（与 vscode.DocumentSymbol 解耦，可独立单测）。
 * 结构对齐 arthas-idea-plugin 中 OgnlPsUtils 对 PSI 的判定所需信息。
 */

export type TypeKind = 'class' | 'interface' | 'enum' | 'record';

export interface MemberDecl {
  /** 方法名 / 字段名 / 枚举常量名 */
  name: string;
  /** 声明所在行（0 基） */
  declLine: number;
  /** 方法体结束行（0 基），字段为 declLine */
  endLine: number;
  /** 方法参数类型（简单名或全限定名） */
  paramTypes: string[];
  isStatic: boolean;
  isFinal: boolean;
  /** 字段类型名 */
  typeName?: string;
  /** 枚举常量 */
  isEnumConstant?: boolean;
}

export interface TypeDecl {
  kind: TypeKind;
  name: string;
  declLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
  methods: MemberDecl[];
  fields: MemberDecl[];
  /** 枚举常量名（按声明顺序） */
  enumConstants: string[];
  children: TypeDecl[];
}

export interface JavaFileModel {
  packageName: string;
  types: TypeDecl[];
}

export type JavaElementKind = 'class' | 'method' | 'field' | 'enum-constant';

/**
 * 光标处 Java 上下文（等价 IDEA 插件中 PSI 元素 + OgnlPsUtils 的判定结果集合）。
 */
export interface JavaContext {
  packageName: string;
  fileBaseName: string;
  /** com.a.b.Outer$Inner；匿名类为 com.a.b.Foo*$* */
  className: string;
  kind: JavaElementKind;
  /** 当前元素简单名（类名/方法名/字段名/枚举常量名） */
  name: string;
  /** '*' 表示类/文件级，'<init>' 表示构造方法 */
  methodName: string;
  isConstructor: boolean;
  isStatic: boolean;
  isFinal: boolean;
  /** 光标所在的（最内层）类是否为 enum */
  isEnumClass: boolean;
  isAnonymous: boolean;
  isInnerClass: boolean;
  /** 成员所在的最内层类简单名 */
  memberClassSimpleName: string;
  methodParamTypes: string[];
  /** 枚举类第一个常量名（可能为空） */
  firstEnumConstant?: string;
  /** 光标在枚举常量上时的常量名 */
  enumConstantName?: string;
  /** 字段是否有 setXxx 方法 */
  hasSetter: boolean;
  fieldTypeName?: string;
  springBeanName: string;
}
