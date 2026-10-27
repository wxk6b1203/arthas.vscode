/**
 * 模板变量表构建 + 替换（对齐 arthas-idea-plugin CommandContext）。
 */
import { JavaContext } from '../java/model';
import { ArthasSettings } from '../settingsBase';
import { DEFAULT_CONDITION_EXPRESS, DEFAULT_SKIP_JDK_FALSE } from './constants';
import { defaultParamsString, defaultOgnlValue } from '../java/defaultValue';
import { buildEnumResolver, fieldDefaultValue } from '../java/javaContext';
import type { JavaFileModel } from '../java/model';

export interface TemplateVars {
  [key: string]: string;
}

export function buildVars(
  java: JavaContext,
  settings: ArthasSettings,
  model: JavaFileModel | null,
  selectedText: string,
): TemplateVars {
  const resolveEnum = model ? buildEnumResolver(model) : undefined;

  const executeInfo =
    java.kind === 'field' || java.kind === 'enum-constant'
      ? java.name
      : java.kind === 'method'
        ? `${java.name}(${defaultParamsString(java.methodParamTypes, resolveEnum)})`
        : '';

  const editorSelect = selectedText && selectedText.trim() ? selectedText.trim() : 'spring.profiles.active';

  const vars: TemplateVars = {
    CLASS_NAME: java.className,
    METHOD_NAME: java.methodName,
    METHOD_NAME_NOT_STAR: java.methodName === '*' ? '' : java.methodName,
    FIELD_NAME: java.kind === 'field' || java.kind === 'enum-constant' ? java.name : '',
    EXECUTE_INFO: executeInfo,
    SPRING_CONTEXT: settings.staticSpringContextOgnl,
    SPRING_BEAN_NAME: java.springBeanName,
    PROPERTY_DEPTH: settings.depth,
    INVOKE_COUNT: settings.invokeCount,
    INVOKE_MONITOR_COUNT: settings.monitorCount,
    INVOKE_MONITOR_INTERVAL: settings.monitorInterval,
    SKIP_JDK_METHOD: settings.traceSkipJdk ? '' : DEFAULT_SKIP_JDK_FALSE,
    PRINT_CONDITION_RESULT: settings.printConditionExpress ? '-v' : '',
    CONDITION_EXPRESS_DEFAULT: settings.conditionExpressDisplay ? DEFAULT_CONDITION_EXPRESS : '',
    DEFAULT_FIELD_VALUE: fieldDefaultValue(java, resolveEnum),
    CAPITALIZE_FIELD_VALUE:
      java.kind === 'field' || java.kind === 'enum-constant'
        ? java.name.charAt(0).toUpperCase() + java.name.slice(1)
        : '',
    EDITOR_SELECT_TEXT: editorSelect,
    // 由 bash 脚本后期解析，这里保留占位
    CLASSLOADER_HASH_VALUE: '${CLASSLOADER_HASH_VALUE}',
  };
  return vars;
}

/** ${VAR} 替换；未命中的占位符原样保留；多余空白收敛为单空格 */
export function substitute(template: string, vars: TemplateVars): string {
  const replaced = template.replace(/\$\{(\w+)\}/g, (m, key: string) => (vars[key] !== undefined ? vars[key] : m));
  return collapseSpaces(replaced);
}

/** 收敛模板变量替换后产生的连续空格（引号内表达式本身不含连续空格） */
export function collapseSpaces(s: string): string {
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

/** 方法默认参数串（供 spring 变体等直接使用） */
export function executeInfoOf(java: JavaContext, model: JavaFileModel | null): string {
  const resolveEnum = model ? buildEnumResolver(model) : undefined;
  if (java.kind === 'field' || java.kind === 'enum-constant') {
    return java.name;
  }
  if (java.kind === 'method') {
    return `${java.name}(${defaultParamsString(java.methodParamTypes, resolveEnum)})`;
  }
  return '';
}

export { defaultOgnlValue };
