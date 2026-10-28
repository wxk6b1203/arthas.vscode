/**
 * 扩展入口：注册命令、右键菜单动态显隐（context key）、各类交互流程。
 */
import * as vscode from 'vscode';
import { BuildInput, commandDefs, CommandDef, enumVariants } from './command/templates';
import { buildVars } from './command/commandContext';
import { constantCommands } from './command/constantCommands';
import { ttCommands } from './command/ttCommands';
import { resolveContext } from './java/javaContext';
import { maskJavaText, parseJavaText } from './java/textParser';
import { buildModelFromSymbols } from './java/symbolProvider';
import { JavaContext, JavaFileModel } from './java/model';
import { getSettings, isSpringContextConfigured, ArthasSettings } from './settings';
import { copyCommand, warnBuildFailed, warnNoJavaContext, warnNotSupported } from './util/clipboard';
import { editablePrompt, PickItem, pickCommand } from './util/input';
import { t } from './util/i18n';
import { runMybatisReload } from './mybatis/mybatisReload';

interface ActiveContext {
  java: ReturnType<typeof resolveContext>;
  settings: ArthasSettings;
  vars: ReturnType<typeof buildVars>;
  model: JavaFileModel | null;
  selectedText: string;
}

const EXT = 'arthas-vscode';

/** def / 常量条目的显示标签（跟随 VSCode 显示语言） */
const labelOf = (zh: string, en?: string): string => t(zh, en ?? zh);

const documentVersionCache = new WeakMap<
  vscode.TextDocument,
  { version: number; model: JavaFileModel | null; text: string; masked: string }
>();

/** 获取文档结构/文本/掩码文本：优先 redhat.java 符号，失败退回文本解析；全部按 version 缓存 */
async function getDocumentInfo(
  document: vscode.TextDocument,
): Promise<{ model: JavaFileModel | null; text: string; masked: string }> {
  const cached = documentVersionCache.get(document);
  if (cached && cached.version === document.version) {
    return cached;
  }
  const text = document.getText();
  let model: JavaFileModel | null = null;
  let timedOut = false;
  try {
    const result = await buildModelFromSymbols(document);
    model = result.model;
    timedOut = result.timedOut;
  } catch {
    model = null;
  }
  if (!model) {
    model = parseJavaText(text);
  }
  const info = { version: document.version, model, text, masked: maskJavaText(text) };
  if (!timedOut) {
    // 符号超时（jdt.ls 预热中）不缓存兜底结果，下次光标移动重试符号路径
    documentVersionCache.set(document, info);
  }
  return info;
}

/** 解析当前编辑器光标处的完整上下文 */
async function resolveActiveContext(): Promise<ActiveContext | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'java') {
    return null;
  }
  const document = editor.document;
  const { model, text, masked } = await getDocumentInfo(document);
  if (!model || model.types.length === 0) {
    return null;
  }
  const pos = editor.selection.active;
  const fileName = document.uri.path.split('/').pop() ?? 'Unknown.java';
  const java = resolveContext({
    text,
    fileName,
    line: pos.line,
    character: pos.character,
    model,
    maskedText: masked,
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

/** 无 Java 上下文时给 contextFree 命令用的空上下文 */
const NULL_JAVA_CONTEXT: JavaContext = {
  packageName: '',
  fileBaseName: '',
  className: '',
  kind: 'class',
  name: '',
  methodName: '*',
  isConstructor: false,
  isStatic: false,
  isFinal: false,
  isEnumClass: false,
  isAnonymous: false,
  isInnerClass: false,
  memberClassSimpleName: '',
  methodParamTypes: [],
  hasSetter: false,
  springBeanName: '',
};

/** contextFree 命令的兜底上下文：选中文本仍取自当前编辑器（任意语言文件） */
function fallbackStubContext(): ActiveContext {
  const editor = vscode.window.activeTextEditor;
  const selectedText =
    editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : '';
  const settings = getSettings();
  return {
    java: NULL_JAVA_CONTEXT,
    settings,
    vars: buildVars(NULL_JAVA_CONTEXT, settings, null, selectedText),
    model: null,
    selectedText,
  };
}

// ---------- 各特殊流程 ----------

async function runLogger(ctx: ActiveContext): Promise<void> {
  // 名称优先级：选中文本 → 光标类名 → ROOT（对齐 issue 165）
  const name = ctx.selectedText || ctx.java!.className || 'ROOT';
  const levels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
  const picked = await vscode.window.showQuickPick(
    levels.map((l) => ({ label: l, description: `logger --name ${name} --level ${l.toLowerCase()}` })),
    { title: t('选择日志级别', 'Select log level'), placeHolder: name },
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
  const items: PickItem[] = variants.map((v) => ({ label: labelOf(v.label, v.labelEn), detail: v.command }));
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
  const edited = await editablePrompt(labelOf(def.label, def.labelEn), base);
  if (edited === undefined) {
    return;
  }
  const alt = def.altBuild ? def.altBuild(buildInputOf(ctx)) : null;
  await copyCommand(edited, { docUrl: def.docUrl, alt: alt ? { label: labelOf(def.altLabel ?? '', def.altLabelEn), command: alt } : undefined });

  // tt 后续命令（等价 IDEA TimeTunnelDialog 的下拉）
  const items: PickItem[] = ttCommands.map((c) => ({
    label: labelOf(c.label, c.labelEn),
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
  let ctx = await resolveActiveContext();
  if (!ctx) {
    // 与光标无关的命令（dashboard/logger/classloader/安装脚本等）无需 Java 上下文
    if (!def.contextFree) {
      warnNoJavaContext();
      return;
    }
    ctx = fallbackStubContext();
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
  if (
    def.id === 'spring.ognlInvoke' || def.id === 'spring.getBeanSetField' ||
    def.id === 'springProps.ognlSelected' || def.id === 'springProps.ognlAll'
  ) {
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
    const edited = await editablePrompt(labelOf(def.label, def.labelEn), command);
    if (edited === undefined) {
      return;
    }
    final = edited;
  }
  const alt = def.altBuild ? def.altBuild(buildInputOf(ctx)) : null;
  await copyCommand(final, {
    docUrl: def.docUrl,
    alt: alt ? { label: labelOf(def.altLabel ?? '', def.altLabelEn), command: alt } : undefined,
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
      id: def.id,
      label: labelOf(def.label, def.labelEn),
      description: def.group === 'quickOnly' ? t('增强', 'extra') : undefined,
      detail: command ?? t('（将弹出选择框）', '(a picker will open)'),
      command: command ?? undefined,
    });
  }
  items.push({
    id: '__presets__',
    label: `$(rocket) ${t('常用预设命令...', 'Common constant commands...')}`,
    detail: t('dispatcher/mybatis/jdbc/profiler/gc 等 30+ 条', 'dispatcher/mybatis/jdbc/profiler/gc and 30+ more'),
  });
  const picked = await pickCommand(t('快速获取可用命令', 'Quickly get available commands'), items);
  if (!picked) {
    return;
  }
  if (picked.id === '__presets__') {
    await runPresets();
    return;
  }
  if (picked.command) {
    await copyCommand(picked.command);
  } else {
    // logger / enum：找到对应 def 走完整流程
    const def = commandDefs.find((d) => d.id === picked.id);
    if (def) {
      await runDef(def);
    }
  }
}

async function runPresets(): Promise<void> {
  const items: PickItem[] = constantCommands.map((c) => ({
    label: labelOf(c.label, c.labelEn),
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

const docLinks: Array<{ label: string; labelEn: string; url: string }> = [
  { label: 'Arthas 官方文档', labelEn: 'Arthas official docs', url: 'https://arthas.aliyun.com/doc/' },
  { label: 'Arthas 进阶使用', labelEn: 'Arthas advanced usage', url: 'https://arthas.aliyun.com/doc/advanced-use.html' },
  { label: 'arthas-idea-plugin 使用文档（语雀）', labelEn: 'arthas-idea-plugin docs (Yuque)', url: 'https://www.yuque.com/arthas-idea-plugin' },
  { label: 'arthas-idea-plugin 特殊用法合集', labelEn: 'arthas-idea-plugin special recipes', url: 'https://www.yuque.com/arthas-idea-plugin/help/zkuar3' },
  { label: 'Watch 观察静态字段/调用静态方法', labelEn: 'Watch static fields / invoke static methods', url: 'https://arthas.aliyun.com/doc/watch.html' },
  { label: '静态 Spring Context 获取 Bean 说明', labelEn: 'Get beans via static Spring Context', url: 'https://www.yuque.com/arthas-idea-plugin/help/ugrc8n' },
  { label: '通过 tt 获取 Spring Context', labelEn: 'Get Spring Context via tt', url: 'https://www.yuque.com/arthas-idea-plugin/help/uldktc' },
  { label: 'arthas-idea-plugin GitHub', labelEn: 'arthas-idea-plugin GitHub', url: 'https://github.com/WangJi92/arthas-idea-plugin' },
  { label: 'arthas-plugin-demo 示例工程', labelEn: 'arthas-plugin-demo sample project', url: 'https://github.com/WangJi92/arthas-plugin-demo' },
];

async function runDocs(): Promise<void> {
  const picked = await pickCommand(
    t('选择文档链接', 'Select a doc link'),
    docLinks.map((d) => ({ label: labelOf(d.label, d.labelEn), url: d.url })),
  );
  if (picked?.url) {
    vscode.env.openExternal(vscode.Uri.parse(picked.url));
  }
}

function runOpenSettings(extensionId: string): void {
  // @ext: 过滤器需要完整扩展 ID（发布者.名称），如 wxk6b1203.arthas-vscode
  vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId}`);
}

// ---------- 右键菜单动态显隐（等价 IDEA 各 Action 的 update()） ----------

let updateTimer: ReturnType<typeof setTimeout> | undefined;
/** 轮次序号：新一轮更新开启后，未跑完的旧轮次自动放弃，避免交错写入混合的菜单状态 */
let contextKeyEpoch = 0;

async function setContext(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', key, value);
}

async function updateContextKeys(): Promise<void> {
  const epoch = ++contextKeyEpoch;
  const editor = vscode.window.activeTextEditor;
  const isJava = !!editor && editor.document.languageId === 'java';

  await setContext('arthas.springConfigured', isSpringContextConfigured(getSettings()));
  if (epoch !== contextKeyEpoch) {
    return;
  }

  let input: BuildInput | null = null;
  if (isJava) {
    const ctx = await resolveActiveContext();
    if (ctx) {
      input = buildInputOf(ctx);
    }
  }
  if (epoch !== contextKeyEpoch) {
    return;
  }
  for (const def of commandDefs) {
    if (epoch !== contextKeyEpoch) {
      return;
    }
    // 与光标无关的命令（dashboard/logger/安装脚本等）始终可用，不受光标位置影响
    const supported = def.contextFree ? true : !!input && def.support(input);
    await setContext(`arthas.cmd.${def.id}`, supported);
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
    vscode.commands.registerCommand(`${EXT}.openSettings`, () => runOpenSettings(context.extension.id)),
    // explorer 右键传入 uri；命令面板走 activeTextEditor 兜底
    vscode.commands.registerCommand(`${EXT}.mybatis.reload`, (uri?: vscode.Uri) => runMybatisReload(uri)),
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
