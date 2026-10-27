/**
 * Mybatis Mapper XML 热重载（对齐 ArthasMybatisMapperReloadAction）。
 * 入口：资源管理器右键 .xml / xml 编辑器右键 / 命令面板。
 * 产物：自包含一键脚本（复制剪贴板，可选保存到 mapper 文件旁）。
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildMybatisScript, MYBATIS_SCRIPT_FILE_NAME } from '../script/mybatisScript';
import { getSettings, isSpringContextConfigured, springContextClassName } from '../settings';
import { toUnicodeEscape } from '../util/clipboard';
import { t } from '../util/i18n';

/** 目标应用需内置的重载服务 starter（README 有说明） */
const DOC_URL = 'https://github.com/WangJi92/mybatis-mapper-reload-spring-boot-start';
const DOC_URL_ZH = 'https://www.yuque.com/arthas-idea-plugin/help/ctgcbg';

/** 解析目标 xml：右键传入的 uri → 当前编辑器（未保存内容优先） */
function resolveXmlTarget(uri?: vscode.Uri): { fileName: string; content: string } | { error: string } {
  let target: vscode.Uri | undefined = uri;
  if (!target) {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'xml') {
      // 未保存的修改优先（用户刚改完 mapper 直接重载的场景）
      return { fileName: path.basename(editor.document.fileName), content: editor.document.getText() };
    }
    return { error: t('请先选中一个 mapper XML 文件', 'Select a mapper XML file first') };
  }
  if (!target.path.toLowerCase().endsWith('.xml')) {
    return { error: t('仅支持 XML 文件', 'Only XML files are supported') };
  }
  const fileName = path.basename(target.fsPath);
  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.toString() === target.toString()) {
    // 该文件正打开在编辑器中（含未保存修改）时优先用编辑器内容
    return { fileName, content: active.document.getText() };
  }
  try {
    return { fileName, content: fs.readFileSync(target.fsPath, 'utf8') };
  } catch {
    return { error: t('读取 XML 文件失败', 'Failed to read the XML file') };
  }
}

export async function runMybatisReload(uri?: vscode.Uri): Promise<void> {
  const settings = getSettings();

  // 前置：静态 Spring Context 已配置（取 classloader hash 依赖它）
  if (!isSpringContextConfigured(settings)) {
    const openBtn = t('打开设置', 'Open settings');
    const chosen = await vscode.window.showErrorMessage(
      t(
        '静态 Spring Context 尚未配置（arthas.staticSpringContextOgnl 需改为非默认值）',
        'Static Spring context is not configured (set arthas.staticSpringContextOgnl to a non-default value)',
      ),
      openBtn,
    );
    if (chosen === openBtn) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'arthas.staticSpringContextOgnl');
    }
    return;
  }
  // 前置：非手动选 pid 时必须配置 selectProjectName（对齐 IDEA 校验）
  let selectValue = '';
  if (!settings.manualSelectPid) {
    if (!settings.selectProjectName.trim()) {
      vscode.window.showErrorMessage(
        t(
          '非手动选 pid 模式必须配置 arthas.selectProjectName（jps -l 查看进程名）',
          'arthas.selectProjectName is required when manualSelectPid is off (check via jps -l)',
        ),
      );
      return;
    }
    selectValue = settings.selectProjectName.trim();
  }

  const target = resolveXmlTarget(uri);
  if ('error' in target) {
    vscode.window.showWarningMessage(target.error);
    return;
  }

  const xmlBase64 = Buffer.from(target.content, 'utf8').toString('base64');
  const result = buildMybatisScript({
    xmlBase64,
    xmlFileName: target.fileName,
    depth: settings.depth,
    springContextOgnl: settings.staticSpringContextOgnl,
    springContextClassName: springContextClassName(settings),
    beanName: settings.mybatisReloadBeanName,
    methodName: settings.mybatisReloadMethodName,
    arthasZipUrl: settings.arthasZipDownloadUrl,
    selectValue,
  });

  // 复制一行命令（沿用中文转 unicode 选项）
  const text = settings.autoToUnicode ? toUnicodeEscape(result.oneLiner) : result.oneLiner;
  await vscode.env.clipboard.writeText(text);

  const saveBtn = t('保存脚本到文件', 'Save script to file');
  const docBtn = t('打开文档', 'Open doc');
  const zh = vscode.env.language.toLowerCase().startsWith('zh');
  const chosen = await vscode.window.showInformationMessage(
    `${t('一键重载脚本已复制', 'One-liner reload script copied')}: ${result.ognlCommand}`,
    saveBtn,
    docBtn,
  );
  if (chosen === saveBtn) {
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(path.dirname(uri?.fsPath ?? target.fileName), MYBATIS_SCRIPT_FILE_NAME)),
      filters: { 'Shell Script': ['sh'] },
    });
    if (saveUri) {
      try {
        fs.writeFileSync(saveUri.fsPath, result.script.replace(/\r\n/g, '\n'), 'utf8');
        const openBtn = t('打开所在目录', 'Reveal in folder');
        const done = await vscode.window.showInformationMessage(
          `${t('脚本已保存', 'Script saved')}: ${saveUri.fsPath}`,
          openBtn,
        );
        if (done === openBtn) {
          vscode.commands.executeCommand('revealInExplorer', saveUri);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`${t('保存脚本失败', 'Failed to save script')}: ${e}`);
      }
    }
  } else if (chosen === docBtn) {
    vscode.env.openExternal(vscode.Uri.parse(zh ? DOC_URL_ZH : DOC_URL));
  }
}
