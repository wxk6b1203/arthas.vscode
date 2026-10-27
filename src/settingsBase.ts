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
}

export const DEFAULT_SPRING_CONTEXT = '@applicationContextProvider@context';

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
