import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseJavaText, maskJavaText, parseParamTypes, parseFieldTypeName } from '../src/java/textParser';

function fixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function lineOf(text: string, marker: string): number {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.includes(marker));
  assert.ok(idx >= 0, `marker not found: ${marker}`);
  return idx;
}

describe('maskJavaText', () => {
  it('遮蔽注释与字符串内容', () => {
    const masked = maskJavaText('String a = "hello {world}"; // comment {\n/* block } */ int b = 1;');
    assert.ok(!masked.includes('hello'));
    assert.ok(!masked.includes('comment'));
    assert.ok(!masked.includes('block'));
    // 结构字符与换行保留
    assert.ok(masked.includes('\n'));
  });
});

describe('parseParamTypes', () => {
  it('基本类型与泛型', () => {
    assert.deepStrictEqual(parseParamTypes('hello(String who, Map<String, Integer> mapping)'), ['String', 'Map<String,Integer>']);
  });
  it('数组与可变参数', () => {
    assert.deepStrictEqual(parseParamTypes('f(String[] args, int... nums)'), ['String[]', 'int[]']);
  });
  it('无参', () => {
    assert.deepStrictEqual(parseParamTypes('f()'), []);
  });
});

describe('parseFieldTypeName', () => {
  it('普通字段', () => {
    assert.deepStrictEqual(parseFieldTypeName('private int count;'), { typeName: 'int', name: 'count' });
  });
  it('带初始化与泛型', () => {
    assert.deepStrictEqual(parseFieldTypeName('private Map<String, Integer> cache = new HashMap<>();'), {
      typeName: 'Map<String,Integer>',
      name: 'cache',
    });
  });
});

describe('parseJavaText / Demo.java', () => {
  const text = fixture('Demo.java');
  const model = parseJavaText(text);

  it('package 正确', () => {
    assert.strictEqual(model.packageName, 'com.example.demo');
  });

  it('顶层类与嵌套类识别', () => {
    assert.strictEqual(model.types.length, 1);
    const demo = model.types[0];
    assert.strictEqual(demo.name, 'Demo');
    const names = demo.children.map((c) => c.name).sort();
    assert.deepStrictEqual(names, ['Color', 'InnerTask', 'StaticInner']);
    const color = demo.children.find((c) => c.name === 'Color')!;
    assert.strictEqual(color.kind, 'enum');
  });

  it('方法/构造器识别（含修饰符）', () => {
    const demo = model.types[0];
    const methodNames = demo.methods.map((m) => m.name).sort();
    assert.deepStrictEqual(methodNames, ['Demo', 'getCount', 'hello', 'innerHelp', 'setCount', 'staticHello']);
    const ctor = demo.methods.find((m) => m.name === 'Demo')!;
    assert.strictEqual(ctor.declLine, lineOf(text, 'public Demo()'));
    const staticHello = demo.methods.find((m) => m.name === 'staticHello')!;
    assert.ok(staticHello.isStatic, 'staticHello 应为 static');
    assert.deepStrictEqual(staticHello.paramTypes, ['String', 'int']);
    const hello = demo.methods.find((m) => m.name === 'hello')!;
    assert.ok(!hello.isStatic);
    assert.deepStrictEqual(hello.paramTypes, ['String', 'List<String>', 'Map<String,Integer>']);
  });

  it('字段识别（static/final/类型）', () => {
    const demo = model.types[0];
    const tag = demo.fields.find((f) => f.name === 'TAG')!;
    assert.ok(tag.isStatic && tag.isFinal);
    assert.strictEqual(tag.typeName, 'String');
    const enabled = demo.fields.find((f) => f.name === 'ENABLED')!;
    assert.strictEqual(enabled.typeName, 'boolean');
    const count = demo.fields.find((f) => f.name === 'count')!;
    assert.ok(!count.isStatic && !count.isFinal);
    // 匿名类 Runnable r 不会被误识别为方法
    assert.ok(!demo.methods.some((m) => m.name === 'Runnable'));
  });

  it('内部类成员', () => {
    const demo = model.types[0];
    const inner = demo.children.find((c) => c.name === 'InnerTask')!;
    assert.ok(inner.fields.some((f) => f.name === 'running'));
    assert.ok(inner.methods.some((m) => m.name === 'run'));
    const staticInner = demo.children.find((c) => c.name === 'StaticInner')!;
    const go = staticInner.methods.find((m) => m.name === 'go')!;
    assert.ok(go.isStatic);
  });

  it('枚举常量与方法', () => {
    const demo = model.types[0];
    const color = demo.children.find((c) => c.name === 'Color')!;
    assert.deepStrictEqual(color.enumConstants, ['RED', 'GREEN', 'BLUE']);
    assert.ok(color.methods.some((m) => m.name === 'lower'));
    const red = color.fields.find((f) => f.name === 'RED')!;
    assert.ok(red.isEnumConstant);
  });

  it('方法体范围覆盖（供光标判定）', () => {
    const demo = model.types[0];
    const hello = demo.methods.find((m) => m.name === 'hello')!;
    const bodyLine = lineOf(text, 'innerHelp();');
    assert.ok(hello.declLine <= bodyLine && bodyLine <= hello.endLine);
    const closingLine = lineOf(text, 'return "hi " + who;');
    assert.ok(closingLine <= hello.endLine);
  });
});
