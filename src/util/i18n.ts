/**
 * 极简运行时双语：根据 VSCode 显示语言选择中/英文文案。
 */
import * as vscode from 'vscode';

const zh = vscode.env.language.toLowerCase().startsWith('zh');

export function t(zhText: string, enText: string): string {
  return zh ? zhText : enText;
}
