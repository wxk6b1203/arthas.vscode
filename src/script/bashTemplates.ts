/**
 * bash 脚本模板底座（移植自 arthas-idea-plugin resources/template/*.sh）。
 * 模板文件中的生成期占位符为 %TOKEN%（避免与 bash 的 ${...} 冲突），
 * 其余 ${...} 均为脚本运行期 bash 变量，填充时原样保留。
 */
import * as fs from 'fs';
import * as path from 'path';

export const TEMPLATE_DIR_CANDIDATES = (): string[] => [
  // esbuild 打包后：out/extension.js → <扩展根>/resources/templates
  path.join(__dirname, '..', 'resources', 'templates'),
  // 单测运行（mocha 自项目根）：项目根/resources/templates
  path.join(process.cwd(), 'resources', 'templates'),
];

const cache = new Map<string, string>();

/** 读取模板（UTF-8，统一 LF） */
export function loadTemplate(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) {
    return hit;
  }
  let content: string | undefined;
  for (const dir of TEMPLATE_DIR_CANDIDATES()) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      content = fs.readFileSync(file, 'utf8');
      break;
    }
  }
  if (content === undefined) {
    throw new Error(`bash template not found: ${name}`);
  }
  const normalized = content.replace(/\r\n/g, '\n');
  cache.set(name, normalized);
  return normalized;
}

/**
 * %TOKEN% 占位符填充。
 * 未提供的 token 原样保留（便于测试断言没有遗漏），行尾统一 LF。
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\r\n/g, '\n')
    .replace(/%([A-Z0-9_]+)%/g, (m, key: string) => (vars[key] !== undefined ? vars[key] : m));
}
