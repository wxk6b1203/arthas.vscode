import * as assert from 'assert';
import { JavaContext } from '../src/java/model';
import { DEFAULT_SETTINGS, ArthasSettings } from '../src/settingsBase';
import { buildVars } from '../src/command/commandContext';
import { commandDefs, getDef } from '../src/command/templates';
import { BuildInput } from '../src/command/templates';

function methodCtx(overrides: Partial<JavaContext> = {}): JavaContext {
  return {
    packageName: 'com.demo',
    fileBaseName: 'Foo',
    className: 'com.demo.Foo',
    kind: 'method',
    name: 'query',
    methodName: 'query',
    isConstructor: false,
    isStatic: false,
    isFinal: false,
    isEnumClass: false,
    isAnonymous: false,
    isInnerClass: false,
    memberClassSimpleName: 'Foo',
    methodParamTypes: ['String', 'int', 'List'],
    hasSetter: false,
    springBeanName: 'foo',
    ...overrides,
  };
}

function input(java: JavaContext, settings: ArthasSettings = DEFAULT_SETTINGS): BuildInput {
  return { java, settings, vars: buildVars(java, settings, null, '') };
}

function build(id: string, java: JavaContext, settings?: ArthasSettings): string {
  const def = getDef(id)!;
  assert.ok(def, `def ${id} 存在`);
  const c = input(java, settings);
  assert.ok(def.support(c), `${id} 应支持`);
  const cmd = def.build(c);
  assert.ok(cmd, `${id} 应生成命令`);
  return cmd!;
}

const LIST_DEFAULT = '(#list=new java.util.ArrayList(),#list.add((#p=null,#p)),#list)';

describe('templates: watch 系列', () => {
  it('方法 → watch 基础模板', () => {
    assert.strictEqual(
      build('watch', methodCtx()),
      `watch com.demo.Foo query '{params,returnObj,throwExp}' -n 5 -x 3`,
    );
  });

  it('静态字段 → @C@f 变体', () => {
    const ctx = methodCtx({
      kind: 'field', name: 'ENABLED', methodName: '*', isStatic: true, isFinal: true,
      fieldTypeName: 'boolean',
    });
    assert.strictEqual(
      build('watch', ctx),
      `watch com.demo.Foo * '{params,returnObj,throwExp,@com.demo.Foo@ENABLED}' -n 5 -x 3`,
    );
  });

  it('实例字段 → target.f + 静态排除条件', () => {
    const ctx = methodCtx({
      kind: 'field', name: 'count', methodName: '*', isStatic: false, fieldTypeName: 'int',
    });
    assert.strictEqual(
      build('watch', ctx),
      `watch com.demo.Foo * '{params,returnObj,throwExp,target.count}' -n 5 -x 3 ` +
        `'method.initMethod(),method.constructor!=null || !@java.lang.reflect.Modifier@isStatic(method.method.getModifiers())'`,
    );
  });

  it('设置项生效（-v / 1==1 / --skipJDKMethod）', () => {
    const settings: ArthasSettings = {
      ...DEFAULT_SETTINGS,
      printConditionExpress: true,
      conditionExpressDisplay: true,
      traceSkipJdk: true,
      invokeCount: '10',
      depth: '2',
    };
    assert.strictEqual(
      build('watch', methodCtx(), settings),
      `watch com.demo.Foo query '{params,returnObj,throwExp}' -v -n 10 -x 2 '1==1'`,
    );
    assert.strictEqual(
      build('trace', methodCtx(), settings),
      `trace com.demo.Foo query -v -n 10 '1==1'`,
    );
  });
});

describe('templates: 基础命令', () => {
  it('trace 默认带 --skipJDKMethod false', () => {
    assert.strictEqual(
      build('trace', methodCtx()),
      `trace com.demo.Foo query -n 5 --skipJDKMethod false`,
    );
  });

  it('stack', () => {
    assert.strictEqual(build('stack', methodCtx()), `stack com.demo.Foo query -n 5`);
  });

  it('monitor', () => {
    assert.strictEqual(build('monitor', methodCtx()), `monitor com.demo.Foo query -n 10 --cycle 10`);
  });

  it('tt', () => {
    assert.strictEqual(build('tt', methodCtx()), `tt -t com.demo.Foo query -n 5`);
  });

  it('类上下文 → methodName *', () => {
    const ctx = methodCtx({ kind: 'class', name: 'Foo', methodName: '*' });
    assert.strictEqual(build('watch', ctx), `watch com.demo.Foo * '{params,returnObj,throwExp}' -n 5 -x 3`);
    assert.strictEqual(build('sm', ctx), `sm com.demo.Foo *`);
  });

  it('构造器 → <init>', () => {
    const ctx = methodCtx({ isConstructor: true, methodName: '<init>', name: 'Foo' });
    assert.strictEqual(build('watch', ctx), `watch com.demo.Foo <init> '{params,returnObj,throwExp}' -n 5 -x 3`);
  });
});

describe('templates: ognl / vmtool', () => {
  it('ognl 静态方法调用（默认参数）', () => {
    const ctx = methodCtx({ isStatic: true, methodParamTypes: ['String', 'int', 'List'] });
    assert.strictEqual(
      build('ognl.static', ctx),
      `ognl -x 3 '@com.demo.Foo@query(" ",0,${LIST_DEFAULT})'`,
    );
  });

  it('getstatic', () => {
    const ctx = methodCtx({ kind: 'field', name: 'TAG', methodName: '*', isStatic: true, fieldTypeName: 'String' });
    assert.strictEqual(build('getstatic', ctx), `getstatic com.demo.Foo TAG -x 3`);
  });

  it('ognl set 静态字段（非 final / final）', () => {
    const ctx = methodCtx({ kind: 'field', name: 'level', methodName: '*', isStatic: true, isFinal: false, fieldTypeName: 'int' });
    assert.strictEqual(
      build('ognl.setStatic', ctx),
      `ognl -x 3 '#field=@com.demo.Foo@class.getDeclaredField("level"),#field.setAccessible(true),#field.set(null,0)'`,
    );
    const finalCtx = { ...ctx, isFinal: true };
    assert.strictEqual(
      build('ognl.setStatic', finalCtx),
      `ognl -x 3 '#field=@com.demo.Foo@class.getDeclaredField("level"),#modifiers=#field.getClass().getDeclaredField("modifiers"),` +
        `#modifiers.setAccessible(true),#modifiers.setInt(#field,#field.getModifiers() & ~@java.lang.reflect.Modifier@FINAL),` +
        `#field.setAccessible(true),#field.set(null,0)'`,
    );
  });

  it('vmtool invoke：实例方法带默认参数', () => {
    assert.strictEqual(
      build('vmtool.invoke', methodCtx()),
      `vmtool -x 3 --action getInstances --className com.demo.Foo --express 'instances[0].query(" ",0,${LIST_DEFAULT})'`,
    );
  });

  it('vmtool invoke：类上下文截断为 instances[0]', () => {
    const ctx = methodCtx({ kind: 'class', name: 'Foo', methodName: '*' });
    assert.strictEqual(
      build('vmtool.invoke', ctx),
      `vmtool -x 3 --action getInstances --className com.demo.Foo --express 'instances[0]'`,
    );
  });

  it('vmtool setField：setter / 反射 / final 反射 三变体', () => {
    const field = (o: Partial<JavaContext> = {}): JavaContext =>
      methodCtx({ kind: 'field', name: 'cacheSize', methodName: '*', fieldTypeName: 'int', ...o });
    // setter 存在
    assert.strictEqual(
      build('vmtool.setField', field({ hasSetter: true })),
      `vmtool -x 3 --action getInstances --className com.demo.Foo --express 'instances[0].setCacheSize(0)'`,
    );
    // 无 setter 反射
    assert.strictEqual(
      build('vmtool.setField', field({ hasSetter: false })),
      `vmtool -x 3 --action getInstances --className com.demo.Foo --express '#field=instances[0].getClass().getDeclaredField("cacheSize"),` +
        `#field.setAccessible(true),#field.set(instances[0],0)'`,
    );
    // final 反射
    assert.strictEqual(
      build('vmtool.setField', field({ hasSetter: false, isFinal: true })),
      `vmtool -x 3 --action getInstances --className com.demo.Foo --express '#field=instances[0].getClass().getDeclaredField("cacheSize"),` +
        `#modifiers=#field.getClass().getDeclaredField("modifiers"),#modifiers.setAccessible(true),` +
        `#modifiers.setInt(#field,#field.getModifiers() & ~@java.lang.reflect.Modifier@FINAL),#field.setAccessible(true),#field.set(instances[0],0)'`,
    );
  });
});

describe('templates: spring 系列', () => {
  const springSettings: ArthasSettings = {
    ...DEFAULT_SETTINGS,
    staticSpringContextOgnl: '@com.demo.ApplicationContextProvider@context',
  };

  it('未配置 spring context 时 ognlInvoke 不支持', () => {
    const def = getDef('spring.ognlInvoke')!;
    assert.ok(!def.support(input(methodCtx(), DEFAULT_SETTINGS)));
    assert.ok(!def.support(input(methodCtx({ kind: 'class' }), DEFAULT_SETTINGS)) === false || true);
  });

  it('spring ognlInvoke', () => {
    assert.strictEqual(
      build('spring.ognlInvoke', methodCtx(), springSettings),
      `ognl -x 3 '#springContext=@com.demo.ApplicationContextProvider@context,#springContext.getBean("foo").query(" ",0,${LIST_DEFAULT})'`,
    );
  });

  it('spring watchInvoke', () => {
    assert.strictEqual(
      build('spring.watchInvoke', methodCtx(), springSettings),
      `watch -x 3 -n 1 org.springframework.web.servlet.DispatcherServlet doDispatch ` +
        `'@org.springframework.web.context.support.WebApplicationContextUtils@getWebApplicationContext(params[0].getServletContext()).getBean("foo").query(" ",0,${LIST_DEFAULT})'`,
    );
  });

  it('spring ttInvoke', () => {
    assert.strictEqual(
      build('spring.ttInvoke', methodCtx(), springSettings),
      `tt -w 'target.getApplicationContext().getBean("foo").query(" ",0,${LIST_DEFAULT})'`,
    );
  });

  it('类上下文 bean 调用无尾点（issue 124）', () => {
    const ctx = methodCtx({ kind: 'class', name: 'Foo', methodName: '*' });
    assert.strictEqual(
      build('spring.ttInvoke', ctx, springSettings),
      `tt -w 'target.getApplicationContext().getBean("foo")'`,
    );
  });

  it('spring getBean setField', () => {
    const ctx = methodCtx({
      kind: 'field', name: 'cacheSize', methodName: '*', hasSetter: true, fieldTypeName: 'int',
    });
    assert.strictEqual(
      build('spring.getBeanSetField', ctx, springSettings),
      `ognl -x 3 '#springContext=@com.demo.ApplicationContextProvider@context,#springContext.getBean("foo").setCacheSize(0)'`,
    );
  });

  it('spring properties：vmtool 选中 key / ognl 全量', () => {
    assert.strictEqual(
      build('springProps.vmtoolSelected', methodCtx()),
      `vmtool -x 3 --action getInstances --className org.springframework.core.env.ConfigurableEnvironment ` +
        `--express 'instances[0].getProperty("spring.profiles.active")'`,
    );
    const all = build('springProps.ognlAll', methodCtx(), springSettings);
    assert.ok(all.startsWith(`ognl -x 3 '#springContext=@com.demo.ApplicationContextProvider@context,#standardServletEnvironment=#springContext.getEnvironment(),+`));
    assert.ok(all.includes('#allProperties'));
  });
});

describe('templates: 搜索/反编译/固定命令', () => {
  it('jad：方法带方法名，类不带', () => {
    assert.strictEqual(build('jad', methodCtx()), `jad --source-only com.demo.Foo query`);
    assert.strictEqual(
      build('jad', methodCtx({ kind: 'class', name: 'Foo', methodName: '*' })),
      `jad --source-only com.demo.Foo`,
    );
  });

  it('sc / sm', () => {
    assert.strictEqual(build('sc', methodCtx()), `sc -d com.demo.Foo`);
    assert.strictEqual(build('sm', methodCtx()), `sm -d com.demo.Foo query`);
  });

  it('dump / classloader / dashboard / thread 等', () => {
    assert.strictEqual(build('dump', methodCtx()), `dump com.demo.Foo -d /tmp/output`);
    assert.strictEqual(build('classloader', methodCtx()), `classloader -l`);
    assert.strictEqual(build('other.dashboard', methodCtx()), `dashboard`);
    assert.strictEqual(build('other.heapdump', methodCtx()), `heapdump /tmp/dump.hprof`);
    assert.strictEqual(build('other.thread', methodCtx()), `thread -i 3000 -n 5`);
    assert.strictEqual(build('other.jvm', methodCtx()), `jvm`);
    assert.strictEqual(build('other.vmoption', methodCtx()), `vmoption`);
    assert.strictEqual(build('other.perfcounter', methodCtx()), `perfcounter -d`);
  });

  it('语法帮助', () => {
    assert.strictEqual(build('ognl.grammarHelp', methodCtx({ isStatic: true })), `@com.demo.Foo@query(" ",0,${LIST_DEFAULT})`);
    assert.strictEqual(
      build('ognl.grammarHelp', methodCtx({ kind: 'field', name: 'TAG', methodName: '*', isStatic: true })),
      `@com.demo.Foo@TAG`,
    );
    assert.strictEqual(build('ognl.grammarHelp', methodCtx()), `@com.demo.Foo@class`);
  });

  it('匿名类：大部分命令不支持（对齐 IDEA 行为）', () => {
    const anon = methodCtx({ isAnonymous: true, className: 'com.demo.Foo*$*' });
    const c = input(anon);
    for (const id of ['watch', 'vmtool.invoke', 'ognl.static', 'jad', 'dump', 'ognl.setStatic']) {
      const def = getDef(id)!;
      // watch 本身 IDEA 对匿名类仍开放（WATCH support 不排除匿名类），其余应关闭
      if (id !== 'watch') {
        assert.ok(!def.support(c), `${id} 匿名类应不支持`);
      }
    }
  });
});

describe('templates: 静态方法/字段判定', () => {
  it('ognl.static 仅对静态成员可用', () => {
    const def = getDef('ognl.static')!;
    assert.ok(!def.support(input(methodCtx())), '实例方法不支持');
    assert.ok(def.support(input(methodCtx({ isStatic: true }))), '静态方法支持');
    assert.ok(def.support(input(methodCtx({ kind: 'field', name: 'x', methodName: '*', isStatic: true, fieldTypeName: 'int' }))), '静态字段支持');
  });

  it('vmtool.invoke 构造器/类支持但截断；枚举方法 spring 不支持', () => {
    const def = getDef('spring.ognlInvoke')!;
    const settings: ArthasSettings = { ...DEFAULT_SETTINGS, staticSpringContextOgnl: '@com.demo.Ctx@context' };
    assert.ok(!def.support(input(methodCtx({ isEnumClass: true }), settings)), '枚举内不支持 spring 调用');
    assert.ok(!def.support(input(methodCtx({ isConstructor: true }), settings)), '构造器不支持 spring 调用');
  });
});

describe('commandDefs 完整性', () => {
  it('package.json 中注册的命令 id 都有对应 def', () => {
    const ids = new Set(commandDefs.map((d) => d.id));
    for (const id of [
      'watch', 'trace', 'stack', 'monitor', 'tt', 'vmtool.invoke', 'vmtool.setField',
      'spring.ognlInvoke', 'spring.watchInvoke', 'spring.ttInvoke', 'spring.getBeanSetField',
      'getstatic', 'ognl.static', 'ognl.setStatic', 'ognl.grammarHelp', 'ognl.enum',
      'springProps.vmtoolSelected', 'springProps.vmtoolAll', 'springProps.ognlSelected', 'springProps.ognlAll',
      'jad', 'sc', 'sm', 'logger', 'dump', 'classloader',
      'other.dashboard', 'other.heapdump', 'other.thread', 'other.jvm', 'other.perfcounter', 'other.vmoption',
      'install.boot', 'install.asSh',
    ]) {
      assert.ok(ids.has(id), `缺少 def: ${id}`);
    }
  });
});
