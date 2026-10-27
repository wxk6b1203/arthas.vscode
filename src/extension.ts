/**
 * 扩展入口：注册命令、右键菜单动态显隐（context key）、各类交互流程。
 */
import * as vscode from 'vscode';
import { BuildInput, commandDefs, CommandDef, enumVariants } from './command/templates';
import { buildVars } from './command/commandContext';
import { constantCommands } from './command/constantCommands';
import { ttCommands } from './command/ttCommands';
import { resolveContext } from './java/javaContext';
import { parseJavaText } from './java/textParser';
import { buildModelFromSymbols } from './java/symbolProvider';
import { JavaFileModel } from './java/model';
import { getSettings, isSpringContextConfigured, ArthasSettings } from './settings';
import { copyCommand, warnBuildFailed, warnNoJavaContext, warnNotSupported } from './util/clipboard';
import { editablePrompt, PickItem, pickCommand } from './util/input';
import { t } from './util/i18n';

interface ActiveContext {
  java: ReturnType<typeof resolveContext>;
  settings: ArthasSettings;
  vars: ReturnType<typeof buildVars>;
  model: JavaFileModel | null;
  selectedText: string;
}

const EXT = 'arthas-vscode';

const documentVersionCache = new WeakMap<vscode.TextDocument, { version: number; model: JavaFileModel | null }>();

/** 获取当前文档结构：优先 redhat.java 符号，失败退回文本解析 */
async function getModel(document: vscode.TextDocument): Promise<JavaFileModel | null> {
  const cached = documentVersionCache.get(document);
  if (cached && cached.version === document.version) {
    return cached.model;
  }
  let model: JavaFileModel | null = null;
  try {
    model = await buildModelFromSymbols(document);
  } catch {
    model = null;
  }
  if (!model) {
    model = parseJavaText(document.getText());
  }
  documentVersionCache.set(document, { version: document.version, model });
  return model;
}

/** 解析当前编辑器光标处的完整上下文 */
async function resolveActiveContext(): Promise<ActiveContext | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'java') {
    return null;
  }
  const document = editor.document;
  const model = await getModel(document);
  if (!model || model.types.length === 0) {
    return null;
  }
  const pos = editor.selection.active;
  const fileName = document.uri.path.split('/').pop() ?? 'Unknown.java';
  const java = resolveContext({
    text: document.getText(),
    fileName,
    line: pos.line,
    character: pos.character,
    model,
  });
  if (!java) {
    return null;
  }
  const selectedText =
    !editor.selection.isEmpty ? document.getText(editor.selection).trim() : '';
  const settings = getSettings();
  const vars = buildVars(java, settings, model, selectedText);
  return { java, settings, vars, model, selectedText };
}

function buildInputOf(ctx: ActiveContext): BuildInput {
  return { java: ctx.java!, settings: ctx.settings, vars: ctx.vars };
}

// ---------- 各特殊流程 ----------

async function runLogger(ctx: ActiveContext): Promise<void> {
  // 名称优先级：选中文本 → 光标类名 → ROOT（对齐 issue 165）
  const name = ctx.selectedText || ctx.java!.className || 'ROOT';
  const levels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
  const picked = await vscode.window.showQuickPick(
    levels.map((l) => ({ label: l, description: `logger --name ${name} --level ${l.toLowerCase()}` })),
    { title: t('选择日志级别', 'Select log level'), ignoreFocusOut: true, placeHolder: name },
  );
  if (!picked) {
    return;
  }
  const level = picked.label.toLowerCase();
  await copyCommand(`logger --name ${name} --level ${level}`, {
    docUrl: 'https://arthas.aliyun.com/doc/logger.html',
  });
}

async function runEnum(def: CommandDef, ctx: ActiveContext): Promise<void> {
  const variants = enumVariants(buildInputOf(ctx));
  if (variants.length === 0) {
    warnBuildFailed();
    return;
  }
  const items: PickItem[] = variants.map((v) => ({ label: v.label, detail: v.command }));
  const picked = await pickCommand(t('选择枚举 ognl 变体', 'Select enum ognl variant'), items);
  if (picked?.command) {
    await copyCommand(picked.command, { docUrl: def.docUrl });
  }
}

async function runTt(def: CommandDef, ctx: ActiveContext): Promise<void> {
  const base = def.build(buildInputOf(ctx));
  if (!base) {
    warnBuildFailed();
    return;
  }
  const edited = await editablePrompt(def.label, base);
  if (edited === undefined) {
    return;
  }
  const alt = def.altBuild ? def.altBuild(buildInputOf(ctx)) : null;
  await copyCommand(edited, { docUrl: def.docUrl, alt: alt ? { label: def.altLabel ?? '', command: alt } : undefined });

  // tt 后续命令（等价 IDEA TimeTunnelDialog 的下拉）
  const items: PickItem[] = ttCommands.map((c) => ({
    label: c.label,
    detail: c.command,
  }));
  const picked = await pickCommand(t('选择 tt 后续命令（Esc 跳过）', 'Select tt follow-up command (Esc to skip)'), items);
  if (picked?.command) {
    const edited2 = await editablePrompt(picked.label, picked.command);
    if (edited2 !== undefined) {
      await copyCommand(edited2);
    }
  }
}

async function springContextGuard(ctx: ActiveContext): Promise<boolean> {
  if (isSpringContextConfigured(ctx.settings)) {
    return true;
  }
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
  return false;
}

// ---------- 通用执行 ----------

async function runDef(def: CommandDef): Promise<void> {
  const ctx = await resolveActiveContext();
  if (!ctx) {
    warnNoJavaContext();
    return;
  }
  if (!def.support(buildInputOf(ctx))) {
    warnNotSupported();
    return;
  }
  if (def.id === 'logger') {
    await runLogger(ctx);
    return;
  }
  if (def.id === 'ognl.enum') {
    await runEnum(def, ctx);
    return;
  }
  if (def.id === 'tt') {
    await runTt(def, ctx);
    return;
  }
  if (def.id === 'spring.ognlInvoke' || def.id === 'spring.getBeanSetField') {
    if (!(await springContextGuard(ctx))) {
      return;
    }
  }
  const command = def.build(buildInputOf(ctx));
  if (!command) {
    warnBuildFailed();
    return;
  }
  let final = command;
  if (def.editable) {
    const edited = await editablePrompt(def.label, command);
    if (edited === undefined) {
      return;
    }
    final = edited;
  }
  const alt = def.altBuild ? def.altBuild(buildInputOf(ctx)) : null;
  await copyCommand(final, {
    docUrl: def.docUrl,
    alt: alt ? { label: def.altLabel ?? '', command: alt } : undefined,
  });
}

// ---------- 快速获取可用命令（等价 IDEA ArthasShellScriptCommandDialog） ----------

async function runQuick(): Promise<void> {
  const ctx = await resolveActiveContext();
  if (!ctx) {
    warnNoJavaContext();
    return;
  }
  const input = buildInputOf(ctx);
  const items: PickItem[] = [];
  for (const def of commandDefs) {
    if (!def.support(input)) {
      continue;
    }
    const command = def.build(input);
    if (!command && def.id !== 'logger' && def.id !== 'ognl.enum') {
      continue;
    }
    items.push({
      label: def.label,
      description: def.group === 'quickOnly' ? t('增强', 'extra') : undefined,
      detail: command ?? t('（将弹出选择框）', '(a picker will open)'),
      command: command ?? undefined,
    });
  }
  items.push({
    label: `$(rocket) ${t('常用预设命令...', 'Common constant commands...')}`,
    detail: t('dispatcher/mybatis/jdbc/profiler/gc 等 30+ 条', 'dispatcher/mybatis/jdbc/profiler/gc and 30+ more'),
  });
  const picked = await pickCommand(t('快速获取可用命令', 'Quickly get available commands'), items);
  if (!picked) {
    return;
  }
  if (picked.label.includes('常用预设命令') || picked.label.includes('Common constant')) {
    await runPresets();
    return;
  }
  if (picked.command) {
    await copyCommand(picked.command);
  } else {
    // logger / enum：找到对应 def 走完整流程
    const def = commandDefs.find((d) => d.label === picked.label);
    if (def) {
      await runDef(def);
    }
  }
}

async function runPresets(): Promise<void> {
  const items: PickItem[] = constantCommands.map((c) => ({
    label: c.label,
    detail: c.command,
    command: c.command,
    url: c.docUrl,
  }));
  const picked = await pickCommand(t('常用预设命令', 'Common constant commands'), items);
  if (picked?.command) {
    await copyCommand(picked.command, { docUrl: picked.url });
  }
}

// ---------- 文档链接 ----------

const docLinks: Array<{ label: string; url: string }> = [
  { label: 'Arthas 官方文档', url: 'https://arthas.aliyun.com/doc/' },
  { label: 'Arthas 进阶使用', url: 'https://arthas.aliyun.com/doc/advanced-use.html' },
  { label: 'arthas-idea-plugin 使用文档（语雀）', url: 'https://www.yuque.com/arthas-idea-plugin' },
  { label: 'arthas-idea-plugin 特殊用法合集', url: 'https://www.yuque.com/arthas-idea-plugin/help/zkuar3' },
  { label: 'Watch 观察静态字段/调用静态方法', url: 'https://arthas.aliyun.com/doc/watch.html' },
  { label: '静态 Spring Context 获取 Bean 说明', url: 'https://www.yuque.com/arthas-idea-plugin/help/ugrc8n' },
  { label: '通过 tt 获取 Spring Context', url: 'https://www.yuque.com/arthas-idea-plugin/help/uldktc' },
  { label: 'arthas-idea-plugin GitHub', url: 'https://github.com/WangJi92/arthas-idea-plugin' },
  { label: 'arthas-plugin-demo 示例工程', url: 'https://github.com/WangJi92/arthas-plugin-demo' },
];

async function runDocs(): Promise<void> {
  const picked = await pickCommand(t('选择文档链接', 'Select a doc link'), docLinks.map((d) => ({ label: d.label, url: d.url })));
  if (picked?.url) {
    vscode.env.openExternal(vscode.Uri.parse(picked.url));
  }
}

function runOpenSettings(): void {
  vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${EXT}`);
}

// ---------- 右键菜单动态显隐（等价 IDEA 各 Action 的 update()） ----------

let updateTimer: ReturnType<typeof setTimeout> | undefined;

async function setContext(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', key, value);
}

async function updateContextKeys(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const isJava = !!editor && editor.document.languageId === 'java';

  await setContext('arthas.springConfigured', isSpringContextConfigured(getSettings()));

  let input: BuildInput | null = null;
  if (isJava) {
    const ctx = await resolveActiveContext();
    if (ctx) {
      input = buildInputOf(ctx);
    }
  }
  for (const def of commandDefs) {
    await setContext(`arthas.cmd.${def.id}`, !!input && def.support(input));
  }
}

function scheduleContextUpdate(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(() => {
    updateTimer = undefined;
    updateContextKeys().catch(() => undefined);
  }, 400);
}

// ---------- 激活 ----------

export function activate(context: vscode.ExtensionContext): void {
  // 各命令定义注册为 VSCode 命令
  for (const def of commandDefs) {
    const disposable = vscode.commands.registerCommand(`${EXT}.${def.id}`, () => runDef(def));
    context.subscriptions.push(disposable);
  }
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXT}.quick`, runQuick),
    vscode.commands.registerCommand(`${EXT}.presets`, runPresets),
    vscode.commands.registerCommand(`${EXT}.docs`, runDocs),
    vscode.commands.registerCommand(`${EXT}.openSettings`, runOpenSettings),
    vscode.window.onDidChangeActiveTextEditor(scheduleContextUpdate),
    vscode.window.onDidChangeTextEditorSelection(scheduleContextUpdate),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('arthas')) {
        scheduleContextUpdate();
      }
    }),
    { dispose: () => { if (updateTimer) { clearTimeout(updateTimer); } } },
  );
  scheduleContextUpdate();
}

export function deactivate(): void {
  // nothing
}
