/**
 * 端到端集成测试：在真实 VSCode 扩展宿主中打开 Demo.java，
 * 移动光标/选中文本后执行右键菜单同款命令，校验写入剪贴板的 Arthas 命令。
 * 测试实例未安装 redhat.java，语言通过 setTextDocumentLanguage 指定，
 * 因此走的是内置文本解析器兜底路径（主路径 DocumentSymbol 需另装 redhat.java）。
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'wxk6b1203.arthas-vscode';
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_DIR = path.join(ROOT, 'test', 'fixtures');
const FIXTURE = path.join(FIXTURE_DIR, 'Demo.java');
const HELPER_FIXTURE = path.join(FIXTURE_DIR, 'Helper.java');
const CALLER_FIXTURE = path.join(FIXTURE_DIR, 'Caller.java');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 关闭弹出的通知，解除 copyCommand 中 showInformationMessage 的挂起 */
async function dismissPopups(): Promise<void> {
  await vscode.commands.executeCommand('notifications.clearAll').then(undefined, () => undefined);
  await vscode.commands.executeCommand('workbench.action.closeNotifications').then(undefined, () => undefined);
}

async function openJavaFile(file: string): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.languages.setTextDocumentLanguage(doc, 'java');
  return vscode.window.showTextDocument(doc);
}

async function openDemoJava(): Promise<vscode.TextEditor> {
  return openJavaFile(FIXTURE);
}

function offsetOfMarker(marker: string): { start: number; end: number } {
  const editor = vscode.window.activeTextEditor!;
  const text = editor.document.getText();
  const lines = text.split('\n');
  const line = lines.findIndex((l) => l.includes(marker));
  assert.ok(line >= 0, `marker not found: ${marker}`);
  const before = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
  const idx = lines[line].indexOf(marker);
  return { start: before + idx, end: before + idx + marker.length };
}

async function placeCursor(marker: string): Promise<void> {
  const editor = vscode.window.activeTextEditor!;
  const pos = editor.document.positionAt(offsetOfMarker(marker).start);
  editor.selection = new vscode.Selection(pos, pos);
  await sleep(100);
}

async function selectRange(marker: string): Promise<void> {
  const editor = vscode.window.activeTextEditor!;
  const { start, end } = offsetOfMarker(marker);
  editor.selection = new vscode.Selection(editor.document.positionAt(start), editor.document.positionAt(end));
  await sleep(100);
}

/** 执行命令（会弹通知），轮询关闭通知直到命令 promise 完成后读取剪贴板 */
async function runCommandAndReadClipboard(commandId: string): Promise<string> {
  const pending = vscode.commands.executeCommand(`arthas-vscode.${commandId}`);
  // 通知可能在命令执行后才弹出（宿主繁忙时更慢），反复关闭直到 promise 完成
  for (let i = 0; i < 60; i++) {
    const settled = await Promise.race([pending.then(() => true), sleep(500).then(() => false)]);
    if (settled) {
      break;
    }
    await dismissPopups();
  }
  await pending;
  return vscode.env.clipboard.readText();
}

describe('arthas-vscode 集成测试（真实扩展宿主）', () => {
  let fakeDefinitionProvider: vscode.Disposable | undefined;

  before(async () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, '扩展应已加载');
    await ext!.activate();

    // 基础套件不安装 redhat.java：注册一个最小定义提供器，模拟 Java 语言服务的引用跳转，
    // 用于验证“光标在方法调用名上 → 解析到目标方法所在类”的逻辑（等价 IDEA PSI_ELEMENT）。
    fakeDefinitionProvider = vscode.languages.registerDefinitionProvider(
      { language: 'java', scheme: 'file' },
      {
        async provideDefinition(document, position) {
          const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][\w$]*/);
          if (!wordRange) {
            return undefined;
          }
          const word = document.getText(wordRange);
          const needle =
            word === 'work'
              ? 'work(String input)'
              : word === 'instanceWork'
                ? 'instanceWork(String input)'
                : word === 'Helper'
                  ? 'class Helper'
                  : undefined;
          if (!needle) {
            return undefined;
          }
          const helper = await vscode.workspace.openTextDocument(vscode.Uri.file(HELPER_FIXTURE));
          const offset = helper.getText().indexOf(needle);
          if (offset < 0) {
            return undefined;
          }
          return new vscode.Location(helper.uri, helper.positionAt(offset));
        },
      },
    );
  });

  after(() => {
    fakeDefinitionProvider?.dispose();
  });

  it('扩展激活且贡献命令已注册', async () => {
    const ext = vscode.extensions.getExtension(EXT_ID)!;
    assert.strictEqual(ext.isActive, true);
    const all = await vscode.commands.getCommands(true);
    for (const id of [
      'arthas-vscode.quick', 'arthas-vscode.watch', 'arthas-vscode.tt',
      'arthas-vscode.other.dashboard', 'arthas-vscode.openSettings',
    ]) {
      assert.ok(all.includes(id), `缺少命令 ${id}`);
    }
  });

  it('方法上下文：watch/trace/stack/monitor/sc/sm/jad/dump', async () => {
    await openDemoJava();
    await placeCursor('public String hello');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo hello '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
    assert.strictEqual(
      await runCommandAndReadClipboard('trace'),
      `trace com.example.demo.Demo hello -n 5 --skipJDKMethod false`,
    );
    assert.strictEqual(await runCommandAndReadClipboard('stack'), `stack com.example.demo.Demo hello -n 5`);
    assert.strictEqual(
      await runCommandAndReadClipboard('monitor'),
      `monitor com.example.demo.Demo hello -n 10 --cycle 10`,
    );
    assert.strictEqual(await runCommandAndReadClipboard('sc'), `sc -d com.example.demo.Demo`);
    assert.strictEqual(await runCommandAndReadClipboard('sm'), `sm -d com.example.demo.Demo hello`);
    assert.strictEqual(await runCommandAndReadClipboard('jad'), `jad --source-only com.example.demo.Demo hello`);
    assert.strictEqual(await runCommandAndReadClipboard('dump'), `dump com.example.demo.Demo -d /tmp/output`);
  });

  it('方法调用名上的引用 → 解析到目标类/方法（对齐 IDEA PSI_ELEMENT）', async () => {
    await openJavaFile(CALLER_FIXTURE);
    await placeCursor('work("x")');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Helper work '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
    await placeCursor('instanceWork("x")');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Helper instanceWork '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
    assert.strictEqual(await runCommandAndReadClipboard('sm'), `sm -d com.example.demo.Helper instanceWork`);
    // 恢复后续用例依赖的 Demo.java 编辑器
    await openDemoJava();
  });

  it('构造器 → <init>', async () => {
    await placeCursor('public Demo()');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo <init> '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
  });

  it('实例字段 → watch target.f 变体', async () => {
    await placeCursor('private int count;');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo * '{params,returnObj,throwExp,target.count}' -n 5 -x 3 ` +
        `'method.initMethod(),method.constructor!=null || !@java.lang.reflect.Modifier@isStatic(method.method.getModifiers())'`,
    );
  });

  it('静态字段 → getstatic / watch @C@f 变体', async () => {
    await placeCursor('private static final String TAG');
    assert.strictEqual(await runCommandAndReadClipboard('getstatic'), `getstatic com.example.demo.Demo TAG -x 3`);
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo * '{params,returnObj,throwExp,@com.example.demo.Demo@TAG}' -n 5 -x 3`,
    );
  });

  it('内部类字段 → Demo$InnerTask', async () => {
    await placeCursor('private boolean running;');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo$InnerTask * '{params,returnObj,throwExp,target.running}' -n 5 -x 3 ` +
        `'method.initMethod(),method.constructor!=null || !@java.lang.reflect.Modifier@isStatic(method.method.getModifiers())'`,
    );
    assert.strictEqual(await runCommandAndReadClipboard('sc'), `sc -d com.example.demo.Demo$InnerTask`);
  });

  it('匿名类体内 → Demo*$* 通配类名', async () => {
    await placeCursor('System.out.println("anon");');
    assert.strictEqual(
      await runCommandAndReadClipboard('watch'),
      `watch com.example.demo.Demo*$* hello '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
  });

  it('枚举常量 → getstatic RED', async () => {
    await placeCursor('RED, GREEN, BLUE;');
    assert.strictEqual(
      await runCommandAndReadClipboard('getstatic'),
      `getstatic com.example.demo.Demo$Color RED -x 3`,
    );
  });

  it('选中文本 → springProps.vmtoolSelected 使用选中 key', async () => {
    await selectRange('DEMO_TAG');
    assert.strictEqual(
      await runCommandAndReadClipboard('springProps.vmtoolSelected'),
      `vmtool -x 3 --action getInstances --className org.springframework.core.env.ConfigurableEnvironment ` +
        `--express 'instances[0].getProperty("DEMO_TAG")'`,
    );
  });

  it('未选中 → springProps.vmtoolSelected 默认 spring.profiles.active', async () => {
    await placeCursor('private int count;');
    assert.strictEqual(
      await runCommandAndReadClipboard('springProps.vmtoolSelected'),
      `vmtool -x 3 --action getInstances --className org.springframework.core.env.ConfigurableEnvironment ` +
        `--express 'instances[0].getProperty("spring.profiles.active")'`,
    );
  });

  it('contextFree：非 Java 文件中也可执行固定命令', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'not java' });
    await vscode.window.showTextDocument(doc);
    assert.strictEqual(await runCommandAndReadClipboard('other.dashboard'), 'dashboard');
    assert.strictEqual(await runCommandAndReadClipboard('classloader'), 'classloader -l');
    assert.strictEqual(
      await runCommandAndReadClipboard('install.asSh'),
      `curl -L "https://arthas.aliyun.com/as.sh" >as.sh;chmod a+x as.sh;./as.sh`,
    );
  });

  it('showCopyNotification=false：静默复制，命令正常完成', async () => {
    const cfg = vscode.workspace.getConfiguration('arthas');
    await cfg.update('showCopyNotification', false, vscode.ConfigurationTarget.Global);
    try {
      await openDemoJava();
      await placeCursor('public String hello');
      assert.strictEqual(
        await runCommandAndReadClipboard('watch'),
        `watch com.example.demo.Demo hello '{params,returnObj,throwExp}' -n 5 -x 3`,
      );
    } finally {
      await cfg.update('showCopyNotification', true, vscode.ConfigurationTarget.Global);
    }
  });
});
