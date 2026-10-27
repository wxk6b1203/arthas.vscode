/**
 * Spring Bean 名称提取（移植自 OgnlPsUtils#getClassBeanName）。
 * 从类声明上方连续注解行中取 @Component/@Service/... 的 value；
 * 取不到时退回首字母小写的简单类名。
 */
const SPRING_STEREOTYPES = [
  'Component', 'Service', 'Controller', 'RestController', 'Repository', 'Configuration',
];

export function uncapitalize(s: string): string {
  if (!s) {
    return s;
  }
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * 从类声明上方的注解文本行中提取 bean 名称。
 * @param annotationLines 类声明上方的连续注解行（原始文本）
 */
export function beanNameFromAnnotations(annotationLines: string[], classSimpleName: string): string {
  for (const raw of annotationLines) {
    const line = raw.trim();
    if (!line.startsWith('@')) {
      continue;
    }
    const m = /^@([\w$.]+?)(\.(?:value|name))?\s*(\((.*)\))?\s*$/.exec(line) ?? /^@([\w$.]+)\s*(\((.*)\))?\s*$/.exec(line);
    if (!m) {
      continue;
    }
    let fqName = m[1];
    // 去掉可能的泛型部分
    const simple = fqName.slice(fqName.lastIndexOf('.') + 1);
    if (!SPRING_STEREOTYPES.includes(simple)) {
      continue;
    }
    const args = m[3] ?? m[4];
    if (args && args.trim()) {
      // 取第一个带引号的字符串（兼容 ("x") 与 (value="x") 与 (name="x")）
      const quoted = /"([^"]+)"/.exec(args);
      if (quoted && quoted[1].trim()) {
        return quoted[1];
      }
    }
    // 注解无参数 → 使用默认 bean 名
    return uncapitalize(classSimpleName);
  }
  return uncapitalize(classSimpleName);
}
