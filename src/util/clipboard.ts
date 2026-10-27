/**
 * 剪贴板 + 通知（对齐 ClipboardUtils/NotifyUtils，含中文自动转 unicode 选项）。
 */
import * as vscode from 'vscode';
import { getSettings } from '../settings';
import { t } from './i18n';

/** 非 ASCII 字符转 \\uXXXX 转义 */
export function toUnicodeEscape(s: string): string {
  // 单引号内的 OGNL 表达式中出现中文会导致部分 shell 解析问题，统一转义
  return s.replace(/[^\x00-\x7F]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export interface CopyOptions {
  docUrl?: string;
  /** 复制后可继续复制的第二命令（AOP 变体等） */
  alt?: { label: string; command: string };
}

export async function copyCommand(command: string, options?: CopyOptions): Promise<void> {
  const settings = getSettings();
  const text = settings.autoToUnicode ? toUnicodeEscape(command) : command;
  await vscode.env.clipboard.writeText(text);

  const docBtn = t('打开文档', 'Open doc');
  const buttons: string[] = [];
  if (options?.docUrl) {
    buttons.push(docBtn);
  }
  if (options?.alt) {
    buttons.push(options.alt.label);
  }
  const msg = `${t('已复制 Arthas 命令', 'Arthas command copied')}: ${command}`;
  const chosen = buttons.length > 0 ? await vscode.window.showInformationMessage(msg, ...buttons) : undefined;
  if (!chosen) {
    return;
  }
  if (options?.docUrl && chosen === docBtn) {
    await vscode.env.openExternal(vscode.Uri.parse(options.docUrl));
  } else if (options?.alt && chosen === options.alt.label) {
    await copyCommand(options.alt.command);
  }
}

export function warnNoJavaContext(): void {
  vscode.window.showWarningMessage(
    t('请打开 Java 文件并将光标置于类/方法/字段上', 'Open a Java file and place the cursor on a class/method/field'),
  );
}

export function warnNotSupported(): void {
  vscode.window.showWarningMessage(
    t('当前光标位置不支持该命令', 'This command is not available at the current cursor position'),
  );
}

export function warnBuildFailed(): void {
  vscode.window.showWarningMessage(t('命令生成失败，请检查光标位置', 'Failed to generate the command, check the cursor position'));
}
