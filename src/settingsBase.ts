/**
 * 纯设置模型（不依赖 vscode，可单测/复用）。
 */

export interface ArthasSettings {
  invokeCount: string;
  monitorCount: string;
  monitorInterval: string;
  depth: string;
  printConditionExpress: boolean;
  conditionExpressDisplay: boolean;
  traceSkipJdk: boolean;
  staticSpringContextOgnl: string;
  autoToUnicode: boolean;
  showCopyNotification: boolean;
  /** 一键脚本默认 --select 值（jps -l 进程名），空则脚本内交互选择 */
  selectProjectName: string;
  /** true=脚本内 jps 交互选 pid（忽略 selectProjectName） */
  manualSelectPid: boolean;
  /** 一键脚本下载安装 arthas 完整 zip 包的地址 */
  arthasZipDownloadUrl: string;
  /** Mybatis XML 重载服务 bean 名（目标应用需内置该 bean） */
  mybatisReloadBeanName: string;
  /** Mybatis XML 重载方法名 */
  mybatisReloadMethodName: string;
}

export const DEFAULT_SPRING_CONTEXT = '@applicationContextProvider@context';

export const DEFAULT_ARTHAS_ZIP_URL = 'https://arthas.aliyun.com/download/latest_version?mirror=aliyun';

export const DEFAULT_MYBATIS_RELOAD_BEAN = 'mybatisMapperXmlFileReloadService';

export const DEFAULT_MYBATIS_RELOAD_METHOD = 'reloadAllSqlSessionFactoryMapper';

export const DEFAULT_SETTINGS: ArthasSettings = {
  invokeCount: '5',
  monitorCount: '10',
  monitorInterval: '10',
  depth: '3',
  printConditionExpress: false,
  conditionExpressDisplay: false,
  traceSkipJdk: false,
  staticSpringContextOgnl: DEFAULT_SPRING_CONTEXT,
  autoToUnicode: true,
  showCopyNotification: true,
  selectProjectName: '',
  manualSelectPid: true,
  arthasZipDownloadUrl: DEFAULT_ARTHAS_ZIP_URL,
  mybatisReloadBeanName: DEFAULT_MYBATIS_RELOAD_BEAN,
  mybatisReloadMethodName: DEFAULT_MYBATIS_RELOAD_METHOD,
};

/**
 * 是否已配置可用的静态 Spring Context（非空且非默认值）。
 * 对齐 SpringStaticContextUtils#getSpringStaticContextConfig。
 */
export function isSpringContextConfigured(settings: ArthasSettings): boolean {
  const v = settings.staticSpringContextOgnl.trim();
  return v.length > 0 && v !== DEFAULT_SPRING_CONTEXT;
}

/** 从配置表达式取提供者类名（@xxx.yyy.Zzz@context → xxx.yyy.Zzz） */
export function springContextClassName(settings: ArthasSettings): string {
  const v = settings.staticSpringContextOgnl.trim();
  const first = v.split('@').filter((s) => s.length > 0)[0];
  return first ?? '';
}
