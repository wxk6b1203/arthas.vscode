/**
 * 自包含脚本的一行执行命令生成（对齐 DirectScriptUtils 剪贴板模式）。
 * 产物格式：echo "<脚本base64>" | base64 --decode ><文件名>;chmod a+x <文件名>;;./<文件名>;
 */

export function base64Of(script: string): string {
  return Buffer.from(script, 'utf8').toString('base64');
}

/** 生成一行命令；bash 变量不转义（b64 为 ASCII，无特殊字符） */
export function buildOneLiner(script: string, scriptFileName: string): string {
  const b64 = base64Of(script);
  return `echo "${b64}" | base64 --decode >${scriptFileName};chmod a+x ${scriptFileName};./${scriptFileName};`;
}
