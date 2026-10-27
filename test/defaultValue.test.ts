import * as assert from 'assert';
import { defaultOgnlValue, defaultParamsString } from '../src/java/defaultValue';

describe('defaultOgnlValue', () => {
  it('基本类型与包装类', () => {
    assert.strictEqual(defaultOgnlValue('boolean'), 'true');
    assert.strictEqual(defaultOgnlValue('Boolean'), 'true');
    assert.strictEqual(defaultOgnlValue('String'), '" "');
    assert.strictEqual(defaultOgnlValue('char'), "'c'");
    assert.strictEqual(defaultOgnlValue('int'), '0');
    assert.strictEqual(defaultOgnlValue('long'), '0L');
    assert.strictEqual(defaultOgnlValue('double'), '0D');
    assert.strictEqual(defaultOgnlValue('float'), '0F');
    assert.strictEqual(defaultOgnlValue('java.lang.String'), '" "');
  });

  it('数组', () => {
    assert.strictEqual(defaultOgnlValue('int[]'), 'new int[]{0}');
    assert.strictEqual(defaultOgnlValue('String[]'), 'new String[]{" "}');
    assert.strictEqual(defaultOgnlValue('com.demo.Foo[]'), 'new com.demo.Foo[]{}');
  });

  it('集合与 Map', () => {
    assert.strictEqual(
      defaultOgnlValue('List'),
      '(#list=new java.util.ArrayList(),#list.add((#p=null,#p)),#list)',
    );
    assert.strictEqual(
      defaultOgnlValue('Set'),
      '(#set=new java.util.HashSet(),#set.add((#p=null,#p)),#set)',
    );
    assert.strictEqual(defaultOgnlValue('Map'), '(#{"test": (#p=null,#p)})');
    assert.strictEqual(
      defaultOgnlValue('LinkedHashMap'),
      '(#@java.util.LinkedHashMap@{"test": (#p=null,#p)})',
    );
  });

  it('JDK 常用类型', () => {
    assert.strictEqual(defaultOgnlValue('BigDecimal'), '(#p=@java.math.BigDecimal@valueOf(1L),#p)');
    assert.strictEqual(defaultOgnlValue('Date'), '(#p=new java.util.Date(),#p)');
    assert.strictEqual(defaultOgnlValue('LocalDateTime'), '(#p=@java.time.LocalDateTime@now(),#p)');
  });

  it('Class 泛型', () => {
    assert.strictEqual(defaultOgnlValue('Class<com.demo.Foo>'), '(@com.demo.Foo@class)');
    assert.strictEqual(defaultOgnlValue('Class'), '(@java.lang.Object@class)');
  });

  it('未知 POJO → null 表达式；void → 空', () => {
    assert.strictEqual(defaultOgnlValue('com.demo.Foo'), '(#p=null,#p)');
    assert.strictEqual(defaultOgnlValue('void'), '');
  });

  it('枚举解析器', () => {
    const resolve = (n: string) => (n === 'Color' ? 'com.demo.Color' : undefined);
    assert.strictEqual(defaultOgnlValue('Color', resolve), '@com.demo.Color@FIRST');
    assert.strictEqual(defaultOgnlValue('Other', resolve), '(#p=null,#p)');
  });

  it('参数串拼接', () => {
    assert.strictEqual(defaultParamsString(['String', 'int', 'boolean']), '" ",0,true');
  });
});
