/**
 * Lombok × redhat.java 主路径集成测试。
 * 前提：.vscode-test/extensions 中已放入 redhat.java（参见 README），
 * 且以 test/fixtures-lombok 作为工作区打开（runTest.ts 条件拉起）。
 * 没有 DocumentSymbol 提供者时整套跳过（兜底文本路径由 extension.test 覆盖）。
 *
 * 注意：这里的被测模块通过编译产物绝对路径 require——src 与 out-test 的目录
 * 深度不同，相对路径无法同时满足编译期与运行期解析。
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FILE = path.join(ROOT, 'test', 'fixtures-lombok', 'src', 'com', 'example', 'demo', 'LombokDemo.java');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = Record<string, any>;
const { buildModelFromSymbols } = require(path.join(ROOT, 'out-test', 'src', 'java', 'symbolProvider.js')) as AnyModule;
const { resolveContext } = require(path.join(ROOT, 'out-test', 'src', 'java', 'javaContext.js')) as AnyModule;
const { buildVars } = require(path.join(ROOT, 'out-test', 'src', 'command', 'commandContext.js')) as AnyModule;
const { DEFAULT_SETTINGS } = require(path.join(ROOT, 'out-test', 'src', 'settingsBase.js')) as AnyModule;
const { getDef } = require(path.join(ROOT, 'out-test', 'src', 'command', 'templates.js')) as AnyModule;

const SPRING_SETTINGS = { ...DEFAULT_SETTINGS, staticSpringContextOgnl: '@com.demo.ApplicationContextProvider@context' };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('arthas-vscode × Lombok（redhat.java 主路径）', function () {
  this.timeout(120000);

  let doc: vscode.TextDocument;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any;
  let text: string;
  let lines: string[];

  before(async function () {
    doc = await vscode.workspace.openTextDocument(vscode.Uri.file(FILE));
    await vscode.languages.setTextDocumentLanguage(doc, 'java');
    let ready = false;
    for (let i = 0; i < 45 && !ready; i++) {
      await sleep(1000);
      try {
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri);
        ready = Array.isArray(symbols) && symbols.length > 0;
      } catch {
        ready = false;
      }
    }
    if (!ready) {
      console.log('[lombok] 无 DocumentSymbol 提供者（未装 redhat.java），跳过主路径套件');
      this.skip();
    }
    model = await buildModelFromSymbols(doc);
    text = doc.getText();
    lines = text.split('\n');
  });

  function ctxAt(marker: string) {
    const line = lines.findIndex((l) => l.includes(marker));
    assert.ok(line >= 0, `marker not found: ${marker}`);
    const java = resolveContext({ text, fileName: 'LombokDemo.java', line, character: 4, model });
    assert.ok(java, `resolveContext 应识别 ${marker}`);
    return java;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function inputOf(java: any, settings = DEFAULT_SETTINGS) {
    return { java, settings, vars: buildVars(java, settings, model, '') };
  }

  it('方法符号名归一化：命令中不出现 "hello(String)"', () => {
    const input = inputOf(ctxAt('public String hello'));
    assert.strictEqual(input.java.kind, 'method');
    assert.strictEqual(input.java.methodName, 'hello');
    assert.strictEqual(
      getDef('watch').build(input),
      `watch com.example.demo.LombokDemo hello '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
  });

  it('@Data 字段：hasSetter 注解推断 → setter 变体 + spring setField 可用', () => {
    const input = inputOf(ctxAt('private int cacheSize'), SPRING_SETTINGS);
    assert.strictEqual(input.java.kind, 'field');
    assert.strictEqual(input.java.hasSetter, true);
    assert.strictEqual(
      getDef('vmtool.setField').build(input),
      `vmtool -x 3 --action getInstances --className com.example.demo.LombokDemo --express 'instances[0].setCacheSize(0)'`,
    );
    assert.strictEqual(getDef('spring.getBeanSetField').support(input), true);
  });

  it('带注解字段：光标在声明行/注解行均识别为字段，@Setter(NONE) 无 setter', () => {
    const atDecl = ctxAt('private String frozen');
    assert.strictEqual(atDecl.kind, 'field');
    assert.strictEqual(atDecl.name, 'frozen');
    assert.strictEqual(atDecl.hasSetter, false);
    const input = inputOf(atDecl, SPRING_SETTINGS);
    const cmd = getDef('vmtool.setField').build(input);
    assert.ok(cmd.includes('getDeclaredField("frozen")'), '应生成反射变体');
    assert.strictEqual(getDef('spring.getBeanSetField').support(input), false);
    const annoLine = lines.findIndex((l) => l.includes('@Setter(AccessLevel.NONE)'));
    const atAnno = resolveContext({ text, fileName: 'LombokDemo.java', line: annoLine, character: 4, model });
    assert.strictEqual(atAnno.kind, 'field');
    assert.strictEqual(atAnno.name, 'frozen');
  });

  it('@Builder 合成类不参与光标判定：@Builder 注解行仍为 LombokDemo 类上下文', () => {
    const annoLine = lines.findIndex((l) => l.trim() === '@Builder');
    const java = resolveContext({ text, fileName: 'LombokDemo.java', line: annoLine, character: 4, model });
    assert.strictEqual(java.className, 'com.example.demo.LombokDemo');
    assert.strictEqual(java.kind, 'class');
    const hasBuilder = model.types.some((t: { children: Array<{ name: string }> }) =>
      t.children.some((c: { name: string }) => c.name.includes('Builder')),
    );
    assert.ok(!hasBuilder, '模型中不应存在合成 Builder 类型');
  });
});
