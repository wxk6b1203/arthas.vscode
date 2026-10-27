import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseJavaText } from '../src/java/textParser';
import { resolveContext } from '../src/java/javaContext';
import { JavaContext } from '../src/java/model';

function fixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function lineOf(text: string, marker: string): number {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.includes(marker));
  assert.ok(idx >= 0, `marker not found: ${marker}`);
  return idx;
}

function at(text: string, marker: string, model: ReturnType<typeof parseJavaText>): JavaContext {
  const line = lineOf(text, marker);
  return resolveContext({ text, fileName: 'Demo.java', line, character: 10, model })!;
}

describe('resolveContext / Demo.java', () => {
  const text = fixture('Demo.java');
  const model = parseJavaText(text);

  it('光标在方法声明行 → method + 静态判定', () => {
    const ctx = at(text, 'public static String staticHello', model);
    assert.strictEqual(ctx.kind, 'method');
    assert.strictEqual(ctx.methodName, 'staticHello');
    assert.ok(ctx.isStatic);
    assert.strictEqual(ctx.className, 'com.example.demo.Demo');
  });

  it('光标在方法体内 → 所属方法', () => {
    const ctx = at(text, 'innerHelp();', model);
    assert.strictEqual(ctx.kind, 'method');
    assert.strictEqual(ctx.methodName, 'hello');
  });

  it('光标在字段声明行 → field + setter 检测', () => {
    const ctx = at(text, 'private int count;', model);
    assert.strictEqual(ctx.kind, 'field');
    assert.strictEqual(ctx.name, 'count');
    assert.strictEqual(ctx.fieldTypeName, 'int');
    assert.ok(ctx.hasSetter, 'count 应检测到 setCount');
    const nameCtx = at(text, 'private String name;', model);
    assert.ok(!nameCtx.hasSetter, 'name 没有 setName');
  });

  it('构造器识别', () => {
    const ctx = at(text, 'public Demo()', model);
    assert.strictEqual(ctx.kind, 'method');
    assert.ok(ctx.isConstructor);
    assert.strictEqual(ctx.methodName, '<init>');
  });

  it('内部类：字段与方法 → Outer$Inner', () => {
    const ctx = at(text, 'private boolean running;', model);
    assert.strictEqual(ctx.className, 'com.example.demo.Demo$InnerTask');
    assert.strictEqual(ctx.fieldTypeName, 'boolean');
    // 注意：'public void run()' 首次出现于匿名类体，InnerTask.run 用相对行定位
    const runLine = lineOf(text, 'private boolean running;') + 2;
    const runCtx = resolveContext({ text, fileName: 'Demo.java', line: runLine, character: 10, model })!;
    assert.strictEqual(runCtx.className, 'com.example.demo.Demo$InnerTask');
    assert.strictEqual(runCtx.methodName, 'run');
  });

  it('枚举：常量与方法', () => {
    const red = at(text, 'RED, GREEN, BLUE;', model);
    assert.strictEqual(red.className, 'com.example.demo.Demo$Color');
    assert.strictEqual(red.kind, 'enum-constant');
    assert.strictEqual(red.enumConstantName, 'RED');
    assert.ok(red.isEnumClass);
    assert.strictEqual(red.firstEnumConstant, 'RED');
    const lower = at(text, 'public String lower()', model);
    assert.strictEqual(lower.kind, 'method');
    assert.strictEqual(lower.methodName, 'lower');
    assert.ok(lower.isEnumClass);
  });

  it('匿名类体内 → *$* 通配类名', () => {
    const ctx = at(text, 'System.out.println("anon");', model);
    assert.ok(ctx.isAnonymous);
    assert.strictEqual(ctx.className, 'com.example.demo.Demo*$*');
  });

  it('类级（方法之间空行处）→ class + methodName *', () => {
    const blank = lineOf(text, 'class InnerTask {') - 1; // 内部类声明前的空行
    const ctx = resolveContext({ text, fileName: 'Demo.java', line: blank, character: 0, model })!;
    assert.strictEqual(ctx.kind, 'class');
    assert.strictEqual(ctx.methodName, '*');
    assert.strictEqual(ctx.memberClassSimpleName, 'Demo');
  });

  it('Spring bean 名：注解 value 优先，否则首字母小写', () => {
    const ctx = at(text, 'public String hello', model);
    assert.strictEqual(ctx.springBeanName, 'demoService');
  });
});
