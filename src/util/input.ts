/**
 * InputBox / QuickPick 交互助手（等价 IDEA 插件中各 Dialog 的“可编辑命令”能力）。
 */
import * as vscode from 'vscode';
import { t } from './i18n';

export async function editablePrompt(title: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title,
    value,
    prompt: t('可直接编辑，回车复制到剪贴板', 'Edit if needed, press Enter to copy'),
    ignoreFocusOut: true,
  });
}

export interface PickItem extends vscode.QuickPickItem {
  /** 对应 CommandDef.id 等路由标识（快速命令面板回跳完整流程用） */
  id?: string;
  /** 选中后要复制的命令（docs 链接等为空，用 url 字段） */
  command?: string;
  url?: string;
}

export async function pickCommand(title: string, items: PickItem[]): Promise<PickItem | undefined> {
  const picked = await vscode.window.showQuickPick(items, {
    title,
    matchOnDetail: true,
    ignoreFocusOut: true,
    placeHolder: t('选择要复制的命令', 'Select a command to copy'),
  });
  return picked;
}
