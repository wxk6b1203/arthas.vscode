/**
 * 全部 Arthas 命令定义：模板 + 适用性判定（对齐 ShellScriptCommandEnum 及各 Action）。
 * 模板字符串与 arthas-idea-plugin 逐条对齐，替换后收敛多余空格。
 */
import { JavaContext } from '../java/model';
import { ArthasSettings, isSpringContextConfigured } from '../settingsBase';
import { substitute, TemplateVars, executeInfoOf } from './commandContext';
import { SPRING_ALL_MAP_PROPERTY } from './constants';

export type CommandGroup =
  | 'basic' | 'vmtool' | 'spring' | 'static' | 'props' | 'search' | 'other' | 'install' | 'help' | 'quickOnly';

export interface BuildInput {
  java: JavaContext;
  settings: ArthasSettings;
  vars: TemplateVars;
}

export interface CommandDef {
  /** VSCode command id 后缀（arthas-vscode.<id>） */
  id: string;
  /** 中文标签 */
  label: string;
  /** 英文标签（扩展层用 t(label, labelEn) 选择显示语言） */
  labelEn?: string;
  group: CommandGroup;
  /** 当前上下文是否可用（决定右键菜单显隐 & 快速命令过滤） */
  support: (c: BuildInput) => boolean;
  /** 生成命令；理论上 support 为 true 时非 null */
  build: (c: BuildInput) => string | null;
  /**
   * 是否与光标上下文无关（dashboard/logger/install 脚本等）：
   * 无 Java 上下文时也可执行（命令面板），右键菜单显隐不受光标位置影响。
   */
  contextFree?: boolean;
  /** 复制前弹出 InputBox 允许编辑 */
  editable?: boolean;
  /** 复制主命令后可再复制的第二命令（AOP 变体） */
  altBuild?: (c: BuildInput) => string | null;
  altLabel?: string;
  altLabelEn?: string;
  tip?: string;
  docUrl?: string;
  /** 是否出现在右键菜单（默认 true） */
  inMenu?: boolean;
}

// ---------- 判定（对齐 OgnlPsUtils） ----------
const isMember = (j: JavaContext): boolean =>
  j.kind === 'class' || j.kind === 'method' || j.kind === 'field' || j.kind === 'enum-constant';
const isStaticField = (j: JavaContext): boolean => (j.kind === 'field' || j.kind === 'enum-constant') && j.isStatic;
const isStaticMethod = (j: JavaContext): boolean => j.kind === 'method' && j.isStatic;
const isStaticMethodOrField = (j: JavaContext): boolean => isStaticField(j) || isStaticMethod(j);
const isNonStaticField = (j: JavaContext): boolean => j.kind === 'field' && !j.isStatic;
const isNonStaticMethod = (j: JavaContext): boolean => j.kind === 'method' && !j.isStatic;
const isNonStaticMethodOrField = (j: JavaContext): boolean => isNonStaticField(j) || isNonStaticMethod(j);
const isJavaPackage = (j: JavaContext): boolean => j.className.startsWith('java.');
const beanOk = (j: JavaContext): boolean => !!j.springBeanName;

const springConfigured = (c: BuildInput): boolean => isSpringContextConfigured(c.settings);

// ---------- watch 系列 ----------
const WATCH = "watch ${CLASS_NAME} ${METHOD_NAME} '{params,returnObj,throwExp}' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} ${CONDITION_EXPRESS_DEFAULT}";
const WATCH_STATIC_FILED = "watch ${CLASS_NAME} * '{params,returnObj,throwExp,@${CLASS_NAME}@${FIELD_NAME}}' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} ${CONDITION_EXPRESS_DEFAULT}";
const WATCH_NON_STATIC_FILED = "watch ${CLASS_NAME} ${METHOD_NAME} '{params,returnObj,throwExp,target.${FIELD_NAME}}' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} 'method.initMethod(),method.constructor!=null || !@java.lang.reflect.Modifier@isStatic(method.method.getModifiers())'";

// ---------- AOP 代理目标 OGNL 公共段 ----------
const AOP_MIDDLE =
  "#isProxy=:[ @org.springframework.aop.support.AopUtils@isAopProxy(#this)?true:false]," +
  "#isJdkDynamicProxy =:[@org.springframework.aop.support.AopUtils@isJdkDynamicProxy(#this) ? true :false ]," +
  "#cglibTarget=:[#hField =#this.getClass().getDeclaredField(\"CGLIB$CALLBACK_0\"),#hField.setAccessible(true)," +
  "#dynamicAdvisedInterceptor=#hField.get(#this),#fieldAdvised=#dynamicAdvisedInterceptor.getClass().getDeclaredField(\"advised\")," +
  "#fieldAdvised.setAccessible(true),1==1? #fieldAdvised.get(#dynamicAdvisedInterceptor).getTargetSource().getTarget():null]," +
  "#jdkTarget=:[ #hField=#this.getClass().getSuperclass().getDeclaredField(\"h\"),#hField.setAccessible(true)," +
  "#aopProxy=#hField.get(#this),#advisedField=#aopProxy.getClass().getDeclaredField(\"advised\"),#advisedField.setAccessible(true)," +
  "1==1?#advisedField.get(#aopProxy).getTargetSource().getTarget():null]," +
  "#nonProxyResultFunc = :[!#isProxy(#this) ? #this :#isJdkDynamicProxy(#this)? #isJdkDynamicProxy(#this) : #cglibTarget(#this)]";

/** spring 上下文调用后缀：EXECUTE_INFO 非空时加前导点（issue 124 修复） */
function springSuffix(c: BuildInput): string {
  const info = executeInfoOf(c.java, null);
  return info ? '.' + info : '';
}

export const commandDefs: CommandDef[] = [
  {
    id: 'watch',
    label: 'Watch 观察方法出入参/返回值/异常',
    labelEn: 'Watch method params/return/exception',
    group: 'basic',
    support: (c) => isMember(c.java),
    build: (c) => {
      if (isStaticField(c.java) && !c.java.isAnonymous) {
        return substitute(WATCH_STATIC_FILED, c.vars);
      }
      if (isNonStaticField(c.java)) {
        return substitute(WATCH_NON_STATIC_FILED, c.vars);
      }
      return substitute(WATCH, c.vars);
    },
    tip: '观察函数调用前后的入参、返回值、异常',
    docUrl: 'https://arthas.aliyun.com/doc/watch.html',
  },
  {
    id: 'trace',
    label: 'Trace 方法调用链耗时',
    labelEn: 'Trace method call chain cost',
    group: 'basic',
    support: (c) => isMember(c.java),
    build: (c) => substitute('trace ${CLASS_NAME} ${METHOD_NAME} ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} ${SKIP_JDK_METHOD} ${CONDITION_EXPRESS_DEFAULT}', c.vars),
    tip: '方法内部调用路径上的每个节点耗时',
    docUrl: 'https://arthas.aliyun.com/doc/trace.html',
  },
  {
    id: 'stack',
    label: 'Stack 输出方法调用路径',
    labelEn: 'Stack print method call path',
    group: 'basic',
    support: (c) => isMember(c.java),
    build: (c) => substitute('stack ${CLASS_NAME} ${METHOD_NAME} ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} ${CONDITION_EXPRESS_DEFAULT}', c.vars),
    tip: '输出当前方法被调用的调用路径',
    docUrl: 'https://arthas.aliyun.com/doc/stack.html',
  },
  {
    id: 'monitor',
    label: 'Monitor 方法执行统计',
    labelEn: 'Monitor method execution stats',
    group: 'basic',
    support: (c) => isMember(c.java),
    build: (c) => substitute('monitor ${CLASS_NAME} ${METHOD_NAME} ${PRINT_CONDITION_RESULT} -n ${INVOKE_MONITOR_COUNT} --cycle ${INVOKE_MONITOR_INTERVAL} ${CONDITION_EXPRESS_DEFAULT}', c.vars),
    tip: '匹配类方法的调用次数和执行耗时统计',
    docUrl: 'https://arthas.aliyun.com/doc/monitor.html',
  },
  {
    id: 'tt',
    label: 'TimeTunnel Tt 方法执行数据时空隧道',
    labelEn: 'TimeTunnel record method invocations',
    group: 'basic',
    support: (c) => isMember(c.java),
    editable: true,
    build: (c) => substitute('tt -t ${CLASS_NAME} ${METHOD_NAME} -n ${INVOKE_COUNT} ${CONDITION_EXPRESS_DEFAULT}', c.vars),
    tip: '记录方法调用现场，支持事后回放/观察',
    docUrl: 'https://arthas.aliyun.com/doc/tt.html',
  },
  {
    id: 'vmtool.invoke',
    label: 'Vmtool 获取实例调用方法/字段',
    labelEn: 'Vmtool get instance invoke method/field',
    group: 'vmtool',
    support: (c) => isMember(c.java) && !c.java.isAnonymous,
    editable: true,
    build: (c) => {
      let command = substitute("vmtool -x ${PROPERTY_DEPTH} --action getInstances --className ${CLASS_NAME} --express 'instances[0].${EXECUTE_INFO}'", c.vars);
      if (c.java.kind === 'class' || c.java.isConstructor || (c.java.kind === 'method' && c.java.isStatic)) {
        command = command.slice(0, command.indexOf("'instances[0].")) + "'instances[0]'";
      }
      return command;
    },
    tip: '获取类实例后调用方法/字段，参数需手动编辑',
    docUrl: 'https://arthas.aliyun.com/doc/vmtool.html',
  },
  {
    id: 'vmtool.setField',
    label: 'Vmtool 获取实例修改字段值',
    labelEn: 'Vmtool get instance set field value',
    group: 'vmtool',
    support: (c) => isNonStaticField(c.java) && !c.java.isAnonymous,
    editable: true,
    build: (c) => {
      if (c.java.isFinal) {
        return substitute(
          "vmtool -x ${PROPERTY_DEPTH} --action getInstances --className ${CLASS_NAME} --express '#field=instances[0].getClass().getDeclaredField(\"${FIELD_NAME}\")," +
          '#modifiers=#field.getClass().getDeclaredField("modifiers"),#modifiers.setAccessible(true),' +
          '#modifiers.setInt(#field,#field.getModifiers() & ~@java.lang.reflect.Modifier@FINAL),#field.setAccessible(true),' +
          "#field.set(instances[0],${DEFAULT_FIELD_VALUE})'",
          c.vars,
        );
      }
      if (!c.java.hasSetter) {
        return substitute(
          "vmtool -x ${PROPERTY_DEPTH} --action getInstances --className ${CLASS_NAME} --express '#field=instances[0].getClass().getDeclaredField(\"${FIELD_NAME}\")," +
          "#field.setAccessible(true),#field.set(instances[0],${DEFAULT_FIELD_VALUE})'",
          c.vars,
        );
      }
      return substitute(
        "vmtool -x ${PROPERTY_DEPTH} --action getInstances --className ${CLASS_NAME} --express 'instances[0].set${CAPITALIZE_FIELD_VALUE}(${DEFAULT_FIELD_VALUE})'",
        c.vars,
      );
    },
    tip: '通过 setter/反射修改实例字段值（final 字段走反射去 final）',
    docUrl: 'https://arthas.aliyun.com/doc/vmtool.html',
  },
  // ---------- Spring 上下文三件套 ----------
  {
    id: 'spring.ognlInvoke',
    label: '静态 Spring Context 调用 Bean 方法',
    labelEn: 'Static Spring Context invoke bean method',
    group: 'spring',
    // 对齐 IDEA SPRING_GET_BEAN.support()：非匿名 + 非构造器 + 非枚举 + 实例方法/实例字段
    support: (c) =>
      !c.java.isAnonymous && !c.java.isConstructor && !c.java.isEnumClass &&
      springConfigured(c) && beanOk(c.java) && !isJavaPackage(c.java) && isNonStaticMethodOrField(c.java),
    editable: true,
    build: (c) =>
      `ognl -x ${c.settings.depth} '#springContext=${c.settings.staticSpringContextOgnl},#springContext.getBean("${c.vars.SPRING_BEAN_NAME}")${springSuffix(c)}'`,
    altBuild: (c) =>
      `ognl '#springContext=${c.settings.staticSpringContextOgnl},#targetBean=#springContext.getBean("${c.vars.SPRING_BEAN_NAME}"),` +
      AOP_MIDDLE + ',#nonProxyTarget=#nonProxyResultFunc(#targetBean),#nonProxyTarget\' -x 1',
    altLabel: '复制 AOP 代理目标命令',
    altLabelEn: 'Copy AOP proxy target command',
    tip: '通过静态持有的 Spring Context 调用 Bean 方法【手动编辑参数】',
    docUrl: 'https://www.yuque.com/arthas-idea-plugin/help/ugrc8n',
  },
  {
    id: 'spring.watchInvoke',
    label: 'Watch Spring Context 调用 Bean 方法',
    labelEn: 'Watch Spring Context invoke bean method',
    group: 'spring',
    // 对齐 IDEA ArthasWatchOgnlSpringContextInvokeMethodAction.update()
    support: (c) =>
      !c.java.isAnonymous && !c.java.isConstructor && !c.java.isEnumClass &&
      beanOk(c.java) && !isJavaPackage(c.java) && isNonStaticMethodOrField(c.java),
    build: (c) =>
      `watch -x ${c.settings.depth} -n 1 org.springframework.web.servlet.DispatcherServlet doDispatch ` +
      `'@org.springframework.web.context.support.WebApplicationContextUtils@getWebApplicationContext(params[0].getServletContext()).getBean("${c.vars.SPRING_BEAN_NAME}")${springSuffix(c)}'`,
    altBuild: (c) =>
      `watch -x 1 -n 1 org.springframework.web.servlet.DispatcherServlet doDispatch '#beanName="${c.vars.SPRING_BEAN_NAME}",` +
      '#targetBean=@org.springframework.web.context.support.WebApplicationContextUtils@getWebApplicationContext(params[0].getServletContext()).getBean(#beanName),' +
      AOP_MIDDLE + ',#nonProxyTarget=#nonProxyResultFunc(#targetBean),#nonProxyTarget\'',
    altLabel: '复制 AOP 代理目标命令',
    altLabelEn: 'Copy AOP proxy target command',
    tip: '需触发任意 Spring MVC 接口调用后生效',
    docUrl: 'https://www.yuque.com/arthas-idea-plugin/help/ugrc8n',
  },
  {
    id: 'spring.ttInvoke',
    label: 'TimeTunnel Spring Context 调用 Bean 方法',
    labelEn: 'TimeTunnel Spring Context invoke bean method',
    group: 'spring',
    // 对齐 IDEA ArthasTimeTunnelOgnlSpringContextInvokeMethodAction.update()
    support: (c) =>
      !c.java.isAnonymous && !c.java.isConstructor && !c.java.isEnumClass &&
      beanOk(c.java) && !isJavaPackage(c.java) && isNonStaticMethodOrField(c.java),
    build: (c) =>
      `tt -w 'target.getApplicationContext().getBean("${c.vars.SPRING_BEAN_NAME}")${springSuffix(c)}'`,
    altBuild: (c) =>
      `tt -w '#beanName="${c.vars.SPRING_BEAN_NAME}",#targetBean=target.getApplicationContext().getBean(#beanName),` +
      AOP_MIDDLE + ",#nonProxyTarget=#nonProxyResultFunc(#targetBean),#nonProxyTarget'",
    altLabel: '复制 AOP 代理目标命令',
    altLabelEn: 'Copy AOP proxy target command',
    tip: '先 tt -t 记录 Spring MVC 调用，再回放执行',
    docUrl: 'https://www.yuque.com/arthas-idea-plugin/help/ugrc8n',
  },
  {
    id: 'spring.getBeanSetField',
    label: 'Spring 获取 Bean 调用 Setter 设置字段',
    labelEn: 'Spring get bean call setter set field',
    group: 'spring',
    inMenu: true,
    support: (c) =>
      !c.java.isAnonymous && !c.java.isConstructor && !c.java.isEnumClass &&
      springConfigured(c) && beanOk(c.java) && !isJavaPackage(c.java) &&
      isNonStaticMethodOrField(c.java) && c.java.kind === 'field' && c.java.hasSetter,
    editable: true,
    build: (c) =>
      `ognl -x ${c.settings.depth} '#springContext=${c.settings.staticSpringContextOgnl},#springContext.getBean("${c.vars.SPRING_BEAN_NAME}").set${c.vars.CAPITALIZE_FIELD_VALUE}(${c.vars.DEFAULT_FIELD_VALUE})'`,
    tip: '通过 Bean 的 setter 修改字段值【需编辑参数】',
  },
  // ---------- 静态方法/字段 ----------
  {
    id: 'getstatic',
    label: 'Getstatic 查看静态字段',
    labelEn: 'Getstatic view static field',
    group: 'static',
    support: (c) => isStaticField(c.java) && !c.java.isAnonymous,
    build: (c) => substitute('getstatic ${CLASS_NAME} ${FIELD_NAME} -x ${PROPERTY_DEPTH}', c.vars),
    tip: '查看类的静态属性',
    docUrl: 'https://arthas.aliyun.com/doc/getstatic.html',
  },
  {
    id: 'ognl.static',
    label: 'Ognl 调用静态方法/静态字段',
    labelEn: 'Ognl invoke static method/field',
    group: 'static',
    support: (c) => isStaticMethodOrField(c.java) && !c.java.isAnonymous,
    editable: true,
    build: (c) => substitute("ognl -x ${PROPERTY_DEPTH} '@${CLASS_NAME}@${EXECUTE_INFO}'", c.vars),
    tip: '执行 ognl 表达式调用静态成员【手动编辑参数】',
    docUrl: 'https://arthas.aliyun.com/doc/ognl.html',
  },
  {
    id: 'ognl.setStatic',
    label: 'Ognl 反射修改静态字段',
    labelEn: 'Ognl set static field via reflection',
    group: 'static',
    support: (c) => isStaticField(c.java) && !c.java.isAnonymous,
    editable: true,
    build: (c) => {
      if (c.java.isFinal) {
        return substitute(
          'ognl -x ${PROPERTY_DEPTH} \'#field=@${CLASS_NAME}@class.getDeclaredField("${FIELD_NAME}"),' +
          '#modifiers=#field.getClass().getDeclaredField("modifiers"),#modifiers.setAccessible(true),' +
          '#modifiers.setInt(#field,#field.getModifiers() & ~@java.lang.reflect.Modifier@FINAL),#field.setAccessible(true),' +
          "#field.set(null,${DEFAULT_FIELD_VALUE})'",
          c.vars,
        );
      }
      return substitute(
        'ognl -x ${PROPERTY_DEPTH} \'#field=@${CLASS_NAME}@class.getDeclaredField("${FIELD_NAME}"),' +
        "#field.setAccessible(true),#field.set(null,${DEFAULT_FIELD_VALUE})'",
        c.vars,
      );
    },
    tip: '通过反射修改静态字段值（final 字段先去 final）【需编辑值】',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/1',
  },
  {
    id: 'ognl.grammarHelp',
    label: '静态 Ognl 语法帮助（复制表达式片段）',
    labelEn: 'Static Ognl grammar help (copy expression)',
    group: 'static',
    support: (c) => isMember(c.java) && !c.java.isAnonymous,
    build: (c) => {
      if (isStaticMethod(c.java)) {
        return `@${c.vars.CLASS_NAME}@${c.vars.EXECUTE_INFO}`;
      }
      if (isStaticField(c.java)) {
        return `@${c.vars.CLASS_NAME}@${c.vars.FIELD_NAME}`;
      }
      return `@${c.vars.CLASS_NAME}@class`;
    },
    tip: '复制 @类@方法/字段 片段，可粘贴到 watch 等表达式',
    docUrl: 'https://arthas.aliyun.com/doc/watch.html',
  },
  {
    id: 'ognl.enum',
    label: 'Ognl 调用枚举',
    labelEn: 'Ognl invoke for enum',
    group: 'static',
    support: (c) => c.java.isEnumClass,
    // 具体变体由 handler 弹 QuickPick 选择；快速命令面板同样走完整流程
    build: () => null,
    tip: '针对枚举常量/枚举方法生成 ognl 调用',
    docUrl: 'https://arthas.aliyun.com/doc/ognl.html',
  },
  // ---------- Spring 配置 ----------
  {
    id: 'springProps.vmtoolSelected',
    label: 'Vmtool 获取选中的 Spring 配置',
    labelEn: 'Vmtool get selected spring property',
    group: 'props',
    contextFree: true,
    support: () => true,
    build: (c) =>
      substitute(
        'vmtool -x ${PROPERTY_DEPTH} --action getInstances --className org.springframework.core.env.ConfigurableEnvironment ' +
        "--express 'instances[0].getProperty(\"${EDITOR_SELECT_TEXT}\")'",
        c.vars,
      ),
    tip: '默认 key 为选中文本，未选中时为 spring.profiles.active',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/100',
  },
  {
    id: 'springProps.vmtoolAll',
    label: 'Vmtool 获取全部 Spring 配置',
    labelEn: 'Vmtool get all spring properties',
    group: 'props',
    contextFree: true,
    support: () => true,
    build: (c) =>
      substitute(
        'vmtool -x ${PROPERTY_DEPTH} --action getInstances --className org.springframework.core.env.ConfigurableEnvironment ' +
        `--express '#standardServletEnvironment=instances[0],${SPRING_ALL_MAP_PROPERTY}'`,
        c.vars,
      ),
    tip: '按优先级输出全部 property source',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/100',
  },
  {
    id: 'springProps.ognlSelected',
    label: 'Ognl 获取选中的 Spring 配置',
    labelEn: 'Ognl get selected spring property',
    group: 'props',
    contextFree: true,
    // 菜单显隐由 arthas.springConfigured 控制；执行时由 springContextGuard 引导配置
    support: () => true,
    build: (c) =>
      `ognl -x ${c.settings.depth} '#springContext=${c.settings.staticSpringContextOgnl},#springContext.getEnvironment().getProperty("${c.vars.EDITOR_SELECT_TEXT}")'`,
    tip: '需要先配置静态 Spring Context',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/100',
  },
  {
    id: 'springProps.ognlAll',
    label: 'Ognl 获取全部 Spring 配置',
    labelEn: 'Ognl get all spring properties',
    group: 'props',
    contextFree: true,
    support: () => true,
    build: (c) =>
      `ognl -x ${c.settings.depth} '#springContext=${c.settings.staticSpringContextOgnl},` +
      `#standardServletEnvironment=#springContext.getEnvironment(),+${SPRING_ALL_MAP_PROPERTY}'`,
    tip: '需要先配置静态 Spring Context',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/100',
  },
  // ---------- 搜索/反编译 ----------
  {
    id: 'jad',
    label: 'Jad 反编译类',
    labelEn: 'Jad decompile class',
    group: 'search',
    support: (c) => isMember(c.java) && !c.java.isAnonymous,
    build: (c) => substitute('jad --source-only ${CLASS_NAME} ${METHOD_NAME_NOT_STAR}', c.vars),
    tip: '反编译指定已加载类的源码',
    docUrl: 'https://arthas.aliyun.com/doc/jad.html',
  },
  {
    id: 'sc',
    label: 'Sc 查看 JVM 已加载的类',
    labelEn: 'Sc search class loaded by JVM',
    group: 'search',
    support: (c) => isMember(c.java),
    build: (c) => substitute('sc -d ${CLASS_NAME}', c.vars),
    tip: '查看类信息（含 classloader hash，供 -c 参数用）',
    docUrl: 'https://arthas.aliyun.com/doc/sc.html',
  },
  {
    id: 'sm',
    label: 'Sm 查看已加载类的方法',
    labelEn: 'Sm search method loaded by JVM',
    group: 'search',
    support: (c) => isMember(c.java),
    build: (c) => {
      if (c.java.kind === 'method') {
        return substitute('sm -d ${CLASS_NAME} ${METHOD_NAME}', c.vars);
      }
      return substitute('sm ${CLASS_NAME} ${METHOD_NAME}', c.vars);
    },
    tip: '查看方法签名（光标在方法上时带 -d 详情）',
    docUrl: 'https://arthas.aliyun.com/doc/sm.html',
  },
  {
    id: 'logger',
    label: 'Logger 动态修改日志级别',
    labelEn: 'Logger change log level',
    group: 'search',
    contextFree: true,
    support: () => true,
    // level 由 handler QuickPick 选择
    build: () => null,
    tip: 'logger --name 取自光标类名/选中文本，否则 ROOT',
    docUrl: 'https://arthas.aliyun.com/doc/logger.html',
  },
  {
    id: 'dump',
    label: 'Dump 类字节码',
    labelEn: 'Dump class bytecode',
    group: 'search',
    support: (c) => isMember(c.java) && !c.java.isAnonymous,
    build: (c) => substitute('dump ${CLASS_NAME} -d /tmp/output', c.vars),
    tip: '导出已加载类的字节码到 /tmp/output',
    docUrl: 'https://arthas.aliyun.com/doc/dump.html',
  },
  {
    id: 'classloader',
    label: 'Classloader 查看类加载器信息',
    labelEn: 'Classloader info',
    group: 'search',
    contextFree: true,
    support: () => true,
    build: () => 'classloader -l',
    tip: '查看类加载器继承树、jar 包等信息',
    docUrl: 'https://arthas.aliyun.com/doc/classloader.html',
  },
  // ---------- 固定命令 ----------
  {
    id: 'other.dashboard',
    label: 'Dashboard 当前 JVM 实时数据面板',
    labelEn: 'Dashboard realtime JVM panel',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'dashboard',
    docUrl: 'https://arthas.aliyun.com/doc/dashboard.html',
  },
  {
    id: 'other.heapdump',
    label: 'Heapdump 堆转储',
    labelEn: 'Heapdump heap dump',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'heapdump /tmp/dump.hprof',
    tip: '加 --live 只 dump 存活对象',
    docUrl: 'https://arthas.aliyun.com/doc/heapdump.html',
  },
  {
    id: 'other.thread',
    label: 'Thread 最耗 CPU 线程栈',
    labelEn: 'Thread top CPU thread stacks',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'thread -i 3000 -n 5',
    docUrl: 'https://arthas.aliyun.com/doc/thread.html',
  },
  {
    id: 'other.jvm',
    label: 'Jvm 查看 JVM 信息',
    labelEn: 'Jvm JVM information',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'jvm',
    docUrl: 'https://arthas.aliyun.com/doc/jvm.html',
  },
  {
    id: 'other.perfcounter',
    label: 'Perfcounter JVM 性能计数',
    labelEn: 'Perfcounter JVM perf counters',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'perfcounter -d',
    docUrl: 'https://arthas.aliyun.com/doc/perfcounter.html',
  },
  {
    id: 'other.vmoption',
    label: 'Vmoption 查看/修改 JVM 诊断参数',
    labelEn: 'Vmoption view/change JVM diagnostic options',
    group: 'other',
    contextFree: true,
    support: () => true,
    build: () => 'vmoption',
    docUrl: 'https://arthas.aliyun.com/doc/vmoption.html',
  },
  // ---------- 安装/帮助 ----------
  {
    id: 'install.boot',
    label: '复制安装脚本（arthas-boot alias as.sh）',
    labelEn: 'Copy install script (arthas-boot alias as.sh)',
    group: 'install',
    contextFree: true,
    support: () => true,
    build: () => 'curl -sk https://arthas.aliyun.com/arthas-boot.jar -o ~/.arthas-boot.jar  && echo "alias as.sh=\'java -jar ~/.arthas-boot.jar --repo-mirror aliyun --use-http 2>&1\'" >> ~/.bashrc && source ~/.bashrc && echo "source ~/.bashrc" >> ~/.bash_profile && source ~/.bash_profile',
    tip: '在目标服务器上执行，安装并设置 as.sh 别名',
  },
  {
    id: 'install.asSh',
    label: '复制安装脚本（as.sh）',
    labelEn: 'Copy install script (as.sh)',
    group: 'install',
    contextFree: true,
    support: () => true,
    build: () => 'curl -L "https://arthas.aliyun.com/as.sh" >as.sh;chmod a+x as.sh;./as.sh',
    tip: '在目标服务器上执行，下载并启动 as.sh',
  },
  // ---------- 仅快速命令（不进右键菜单，等价 IDEA 快速对话框中的增强项） ----------
  {
    id: 'watchPrintStack',
    label: "Watch 打印调用栈 'new Throwable()'",
    labelEn: "Watch print call stack 'new Throwable()'",
    group: 'quickOnly',
    inMenu: false,
    support: (c) => isMember(c.java),
    build: (c) => substitute("watch ${CLASS_NAME} ${METHOD_NAME} 'new Throwable()' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} ${CONDITION_EXPRESS_DEFAULT}", c.vars),
    docUrl: 'https://mp.weixin.qq.com/s/8ezzcBEdfmsAdcnlLWlq4w',
  },
  {
    id: 'watchExecStatic',
    label: 'Watch 执行静态方法（观察表达式内调用）',
    labelEn: 'Watch execute static method (in watch expression)',
    group: 'quickOnly',
    inMenu: false,
    support: (c) => isStaticMethod(c.java) && !c.java.isAnonymous,
    build: (c) => substitute("watch ${CLASS_NAME} * '{params,returnObj,throwExp,@${CLASS_NAME}@${EXECUTE_INFO}}' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} ${CONDITION_EXPRESS_DEFAULT}", c.vars),
    docUrl: 'https://arthas.aliyun.com/doc/watch.html',
  },
  {
    id: 'watchExecNonStatic',
    label: 'Watch 执行实例方法（观察表达式内调用）',
    labelEn: 'Watch execute instance method (in watch expression)',
    group: 'quickOnly',
    inMenu: false,
    support: (c) => isNonStaticMethod(c.java) && !c.java.isConstructor,
    build: (c) => substitute("watch ${CLASS_NAME} * '{params,returnObj,throwExp,target.${EXECUTE_INFO}}' ${PRINT_CONDITION_RESULT} -n ${INVOKE_COUNT} -x ${PROPERTY_DEPTH} 'method.initMethod(),method.constructor!=null || !@java.lang.reflect.Modifier@isStatic(method.method.getModifiers())'", c.vars),
    docUrl: 'https://arthas.aliyun.com/doc/watch.html',
  },
  {
    id: 'vmtoolInstance',
    label: 'Vmtool 获取类的全部实例',
    labelEn: 'Vmtool get all instances of the class',
    group: 'quickOnly',
    inMenu: false,
    support: (c) => isMember(c.java) && !c.java.isAnonymous,
    build: (c) => substitute('vmtool -x 1 --action getInstances --className ${CLASS_NAME} --limit 5', c.vars),
    docUrl: 'https://arthas.aliyun.com/doc/vmtool.html',
  },
];

/** 枚举 ognl 变体（对齐 ArthasOgnlEnumAction） */
export interface EnumVariant {
  label: string;
  /** 英文标签（扩展层用 t(label, labelEn) 选择显示语言） */
  labelEn?: string;
  command: string;
}

export function enumVariants(c: BuildInput): EnumVariant[] {
  const j = c.java;
  const className = j.className;
  const out: EnumVariant[] = [];
  if (j.kind === 'enum-constant' && j.enumConstantName) {
    out.push({
      label: `枚举常量 ${j.enumConstantName}`,
      labelEn: `Enum constant ${j.enumConstantName}`,
      command: `ognl -x ${c.settings.depth} '@${className}@${j.enumConstantName}'`,
    });
  }
  if (j.kind === 'method' && j.isEnumClass && !j.isStatic) {
    const first = j.firstEnumConstant;
    if (first) {
      out.push({
        label: `枚举常量.${j.name}()`,
        labelEn: `enumConstant.${j.name}()`,
        command: `ognl -x ${c.settings.depth} '@${className}@${first}.${c.vars.EXECUTE_INFO}'`,
      });
    }
  }
  if (isStaticMethod(j)) {
    out.push({
      label: `静态方法 ${j.name}()`,
      labelEn: `Static method ${j.name}()`,
      command: `ognl -x ${c.settings.depth} '@${className}@${c.vars.EXECUTE_INFO}'`,
    });
  }
  if (isStaticField(j) && j.kind === 'field') {
    out.push({
      label: `静态字段 ${j.name}`,
      labelEn: `Static field ${j.name}`,
      command: `ognl -x ${c.settings.depth} '@${className}@${j.name}'`,
    });
  }
  if (j.kind === 'class') {
    const first = j.firstEnumConstant;
    if (first) {
      out.push({
        label: `枚举常量 ${first}`,
        labelEn: `Enum constant ${first}`,
        command: `ognl -x ${c.settings.depth} '@${className}@${first}'`,
      });
    } else {
      out.push({
        label: '枚举类',
        labelEn: 'Enum class',
        command: `ognl -x ${c.settings.depth} '@${className}@class'`,
      });
    }
  }
  return out;
}

export function getDef(id: string): CommandDef | undefined {
  return commandDefs.find((d) => d.id === id);
}
