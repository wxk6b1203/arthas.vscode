/**
 * Mybatis Mapper XML 热重载脚本生成（纯函数，移植自 ArthasMybatisMapperReloadAction）。
 *
 * 产物为自包含 bash 脚本：装 arthas → 选 pid → 解码 xml 到
 * $HOME/opt/arthas/mybatis/mapper/ → sc -d 取 classloader hash →
 * ognl 调用 spring bean 的 reloadAllSqlSessionFactoryMapper(path)。
 *
 * 前置条件（README 有说明）：
 * - 已配置静态 Spring Context（arthas.staticSpringContextOgnl 非默认值）
 * - 目标应用内置 mybatisMapperXmlFileReloadService bean（实现见 IDEA 插件文档）
 */
import { fillTemplate, loadTemplate } from './bashTemplates';
import { buildOneLiner } from './oneLiner';

/** 服务器上 xml 解码后的存放目录（ArthasCommandConstants.MYBATIS_MAPPER_RELOAD_BASH_PACKAGE_PATH） */
export const MYBATIS_MAPPER_DIR = '$HOME/opt/arthas/mybatis/mapper';

export const MYBATIS_SCRIPT_FILE_NAME = 'arthas-idea-plugin-mybatis-mapper-xml-reload.sh';

export interface MybatisScriptInput {
  /** mapper xml 内容的 base64 */
  xmlBase64: string;
  /** mapper xml 文件名（如 UserMapper.xml） */
  xmlFileName: string;
  /** -x 展开层级 */
  depth: string;
  /** 静态 Spring Context ognl（已确认非默认值） */
  springContextOgnl: string;
  /** Spring Context 提供者类名（sc -d 用） */
  springContextClassName: string;
  /** 重载服务 bean 名 */
  beanName: string;
  /** 重载方法名 */
  methodName: string;
  /** arthas zip 完整包下载地址 */
  arthasZipUrl: string;
  /** --select 值；空 = 脚本内交互式 jps 选 pid */
  selectValue: string;
}

export interface MybatisScriptResult {
  /** 生成的 ognl 命令（未转义，用于展示） */
  ognlCommand: string;
  /** 自包含 bash 脚本全文（LF） */
  script: string;
  /** 一行执行命令（base64 内嵌） */
  oneLiner: string;
  scriptFileName: string;
}

/** 生成 ognl 命令（未转义原样） */
export function buildMybatisOgnlCommand(input: MybatisScriptInput): string {
  const mapperPath = `${MYBATIS_MAPPER_DIR}/${input.xmlFileName}`;
  const prefix = `#springContext=${input.springContextOgnl},#springContext.getBean("${input.beanName}")`;
  const methodAndParam = `${input.methodName}("${mapperPath}")`;
  return `ognl -x ${input.depth} '${prefix}.${methodAndParam}' -c $CLASSLOADER_HASH_VALUE`;
}

/**
 * 生成完整脚本与一行命令。
 * 注意 ognl 命令内嵌到 bash 双引号中，`"` 需转义为 `\"`（对齐 IDEA 原实现）。
 */
export function buildMybatisScript(input: MybatisScriptInput): MybatisScriptResult {
  const ognlCommand = buildMybatisOgnlCommand(input);
  const escapedCommand = ognlCommand.replace(/"/g, '\\"');

  const mapperPath = `${MYBATIS_MAPPER_DIR}/${input.xmlFileName}`;
  const base64AndPath = `${input.xmlBase64}|${mapperPath}`;
  const scCommand = `sc -d ${input.springContextClassName}`;

  const commonVars = {
    SELECT_VALUE: input.selectValue,
    ARTHAS_ZIP_URL: input.arthasZipUrl,
    SC_COMMAND: scCommand,
    BASE64_TXT_AND_PATH: base64AndPath,
  };
  const common = fillTemplate(loadTemplate('plugin-common-function.sh'), commonVars);
  const mybatis = fillTemplate(loadTemplate('mybatis-mapper-xml-reload.sh'), {
    MYBATIS_COMMAND: escapedCommand,
  });

  const script = `${common}\n${mybatis}`;
  return {
    ognlCommand,
    script,
    oneLiner: buildOneLiner(script, MYBATIS_SCRIPT_FILE_NAME),
    scriptFileName: MYBATIS_SCRIPT_FILE_NAME,
  };
}
