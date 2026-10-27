import * as assert from 'assert';
import { parseJavaText, cleanMemberName } from '../src/java/textParser';
import { resolveContext, lombokSetterExists } from '../src/java/javaContext';
import { JavaContext, JavaFileModel, MemberDecl, TypeDecl } from '../src/java/model';
import { buildVars } from '../src/command/commandContext';
import { DEFAULT_SETTINGS, ArthasSettings } from '../src/settingsBase';
import { getDef } from '../src/command/templates';

const LOMBOK_SRC = `package com.demo;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Data;
import lombok.Setter;
import lombok.Value;
import lombok.experimental.Accessors;

@Data
@Builder
public class Order {

    private String name;

    private int cacheSize;

    @Setter(AccessLevel.NONE)
    private String frozen;

    public String hello(String who) {
        return name + who;
    }
}

@Value
public class Money {
    private long amount;
}

@Accessors(fluent = true)
public class Fluent {
    private int count;
}
`;

const SPRING_SETTINGS: ArthasSettings = {
  ...DEFAULT_SETTINGS,
  staticSpringContextOgnl: '@com.demo.ApplicationContextProvider@context',
};

function ctxAt(text: string, marker: string, model: JavaFileModel): JavaContext {
  const lines = text.split('\n');
  const line = lines.findIndex((l) => l.includes(marker));
  assert.ok(line >= 0, `marker not found: ${marker}`);
  return resolveContext({ text, fileName: 'Order.java', line, character: 4, model })!;
}

function inputOf(java: JavaContext, settings: ArthasSettings = DEFAULT_SETTINGS) {
  return { java, settings, vars: buildVars(java, settings, null, '') };
}

describe('cleanMemberName：符号名参数归一化', () => {
  it('去掉符号名中的参数部分', () => {
    assert.strictEqual(cleanMemberName('hello(String)'), 'hello');
    assert.strictEqual(cleanMemberName('hello(String, int)'), 'hello');
    assert.strictEqual(cleanMemberName('Order()'), 'Order');
    assert.strictEqual(cleanMemberName('hello'), 'hello');
    assert.strictEqual(cleanMemberName('getX ()'), 'getX');
  });
});

describe('lombokSetterExists：Lombok setter 注解推断', () => {
  it('类级 @Data / @Setter 生成 setter', () => {
    assert.strictEqual(lombokSetterExists([], ['@Data']), true);
    assert.strictEqual(lombokSetterExists([], ['@lombok.Setter']), true);
    assert.strictEqual(lombokSetterExists([], ['public class X {']), false);
  });

  it('@Value / @Accessors(fluent) / AccessLevel.NONE 不生成 set 前缀方法', () => {
    assert.strictEqual(lombokSetterExists([], ['@Data', '@Value']), false);
    assert.strictEqual(lombokSetterExists([], ['@Data', '@Accessors(fluent = true)']), false);
    assert.strictEqual(lombokSetterExists([], ['@Setter(AccessLevel.NONE)']), false);
  });

  it('字段级 @Setter 优先于类级注解', () => {
    assert.strictEqual(lombokSetterExists(['@Setter'], ['@Data']), true);
    assert.strictEqual(lombokSetterExists(['@Setter(AccessLevel.NONE)'], ['@Data']), false);
    assert.strictEqual(lombokSetterExists(['@Setter(AccessLevel.PROTECTED)'], []), true);
  });
});

describe('Lombok 端到端（文本路径 resolveContext + 命令生成）', () => {
  const model = parseJavaText(LOMBOK_SRC);

  it('@Data 字段：hasSetter=true，vmtool/spring 走 setter 变体', () => {
    const java = ctxAt(LOMBOK_SRC, 'private int cacheSize', model);
    assert.strictEqual(java.kind, 'field');
    assert.strictEqual(java.hasSetter, true);
    const input = inputOf(java, SPRING_SETTINGS);
    const setField = getDef('vmtool.setField')!;
    assert.strictEqual(
      setField.build(input),
      `vmtool -x 3 --action getInstances --className com.demo.Order --express 'instances[0].setCacheSize(0)'`,
    );
    assert.strictEqual(getDef('spring.getBeanSetField')!.support(input), true);
  });

  it('@Setter(AccessLevel.NONE) 字段：回退反射变体，spring setField 隐藏', () => {
    const java = ctxAt(LOMBOK_SRC, 'private String frozen', model);
    assert.strictEqual(java.hasSetter, false);
    const input = inputOf(java, SPRING_SETTINGS);
    const cmd = getDef('vmtool.setField')!.build(input)!;
    assert.ok(cmd.includes('getDeclaredField("frozen")'), '应生成反射变体');
    assert.strictEqual(getDef('spring.getBeanSetField')!.support(input), false);
  });

  it('@Value / @Accessors(fluent) 类字段：无 setter', () => {
    assert.strictEqual(ctxAt(LOMBOK_SRC, 'private long amount', model).hasSetter, false);
    assert.strictEqual(ctxAt(LOMBOK_SRC, 'private int count', model).hasSetter, false);
  });

  it('@Builder 类仍识别为普通类，方法/字段命令不受影响', () => {
    const hello = ctxAt(LOMBOK_SRC, 'public String hello', model);
    assert.strictEqual(hello.kind, 'method');
    assert.strictEqual(hello.methodName, 'hello');
    const input = inputOf(hello);
    assert.strictEqual(
      getDef('watch')!.build(input),
      `watch com.demo.Order hello '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
  });
});

describe('redhat.java 符号路径行为模拟（手工构造 model）', () => {
  /** 模拟 jdt.ls 的符号特征：类/字段 declLine 在注解行、字段 range 跨注解+声明两行 */
  const text = [
    'package com.demo;',
    '',
    '@Component("orderBean")',
    '@Data',
    'public class Order {',
    '',
    '    @Setter(AccessLevel.NONE)',
    '    private String frozen;',
    '',
    '    private int cacheSize;',
    '}',
  ].join('\n');

  const fields: MemberDecl[] = [
    { name: 'frozen', declLine: 6, endLine: 7, paramTypes: [], isStatic: false, isFinal: false, typeName: 'String' },
    { name: 'cacheSize', declLine: 9, endLine: 9, paramTypes: [], isStatic: false, isFinal: false, typeName: 'int' },
  ];
  const type: TypeDecl = {
    kind: 'class', name: 'Order', declLine: 2, bodyStartLine: 4, bodyEndLine: 10,
    methods: [], fields, enumConstants: [], children: [],
  };
  const model: JavaFileModel = { packageName: 'com.demo', types: [type] };

  it('类 declLine 在注解行：@Component value 仍能取到（bean 名）', () => {
    const java = resolveContext({ text, fileName: 'Order.java', line: 4, character: 4, model })!;
    assert.strictEqual(java.springBeanName, 'orderBean');
  });

  it('字段光标在声明行（range 内）可识别，且注解行自身也命中', () => {
    const atDecl = resolveContext({ text, fileName: 'Order.java', line: 7, character: 4, model })!;
    assert.strictEqual(atDecl.kind, 'field');
    assert.strictEqual(atDecl.name, 'frozen');
    const atAnno = resolveContext({ text, fileName: 'Order.java', line: 6, character: 4, model })!;
    assert.strictEqual(atAnno.kind, 'field');
    assert.strictEqual(atAnno.name, 'frozen');
  });

  it('@Setter(NONE) 注解行作为字段 range 起点时也能被推断为无 setter', () => {
    const java = resolveContext({ text, fileName: 'Order.java', line: 6, character: 4, model })!;
    assert.strictEqual(java.hasSetter, false);
    // 类级 @Data 的字段：setter 推断生效
    const cache = resolveContext({ text, fileName: 'Order.java', line: 9, character: 4, model })!;
    assert.strictEqual(cache.hasSetter, true);
  });
});
