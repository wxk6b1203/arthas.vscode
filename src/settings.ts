/**
 * 设置读取（对齐 arthas-idea-plugin 的 AppSettingsState 中命令相关部分）。
 */
import * as vscode from 'vscode';
import { ArthasSettings, DEFAULT_SETTINGS } from './settingsBase';

export * from './settingsBase';

export function getSettings(): ArthasSettings {
  const config = vscode.workspace.getConfiguration('arthas');
  return {
    invokeCount: String(config.get<number>('invokeCount', 5)),
    monitorCount: String(config.get<number>('monitorCount', 10)),
    monitorInterval: String(config.get<number>('monitorInterval', 10)),
    depth: String(config.get<number>('depth', 3)),
    printConditionExpress: config.get<boolean>('printConditionExpress', false),
    conditionExpressDisplay: config.get<boolean>('conditionExpressDisplay', false),
    traceSkipJdk: config.get<boolean>('traceSkipJdk', false),
    staticSpringContextOgnl: config.get<string>('staticSpringContextOgnl', DEFAULT_SETTINGS.staticSpringContextOgnl),
    autoToUnicode: config.get<boolean>('autoToUnicode', true),
    showCopyNotification: config.get<boolean>('showCopyNotification', true),
    selectProjectName: config.get<string>('selectProjectName', ''),
    manualSelectPid: config.get<boolean>('manualSelectPid', true),
    arthasZipDownloadUrl: config.get<string>('arthasZipDownloadUrl', DEFAULT_SETTINGS.arthasZipDownloadUrl),
    mybatisReloadBeanName: config.get<string>('mybatis.reloadBeanName', DEFAULT_SETTINGS.mybatisReloadBeanName),
    mybatisReloadMethodName: config.get<string>('mybatis.reloadMethodName', DEFAULT_SETTINGS.mybatisReloadMethodName),
  };
}
