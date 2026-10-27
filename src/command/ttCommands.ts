/**
 * tt 后续命令（逐字移植 TimeTunnelCommandEnum）。
 */
export interface TtCommand {
  label: string;
  command: string;
}

export const ttCommands: TtCommand[] = [
  { label: '重新触发一次 (tt -p)', command: 'tt -p -i 1000' },
  { label: '重新触发 5 次，间隔 2 秒', command: 'tt -p --replay-times 5 --replay-interval 2000 -i 1000' },
  { label: "观察表达式 '{method.name,params,returnObj,throwExp}'", command: "tt -w '{method.name,params,returnObj,throwExp}' -x 3 -i 1000" },
  { label: '获取拦截的目标对象 target', command: 'tt -w target  -x 1 -i 1000 ' },
  { label: '获取 JDK 代理的 InvocationHandler', command: "tt -w '#isProxy=:[ #this instanceof java.lang.reflect.Proxy ? @java.lang.reflect.Proxy@getInvocationHandler(#this) : #this],#isProxy(target)' -x 1 -i 1000 " },
  {
    label: '获取 Spring AOP 代理的真实对象',
    command: "tt -w '#isProxy=:[ @org.springframework.aop.support.AopUtils@isAopProxy(#this)?true:false],#isJdkDynamicProxy =:[@org.springframework.aop.support.AopUtils@isJdkDynamicProxy(#this) ? true :false ],#cglibTarget =:[#hField =#this.getClass().getDeclaredField(\"CGLIB$CALLBACK_0\"),#hField.setAccessible(true),#dynamicAdvisedInterceptor=#hField.get(#this),#fieldAdvised=#dynamicAdvisedInterceptor.getClass().getDeclaredField(\"advised\"),#fieldAdvised.setAccessible(true),1==1? #fieldAdvised.get(#dynamicAdvisedInterceptor).getTargetSource().getTarget():null],#jdkTarget=:[ #hField=#this.getClass().getSuperclass().getDeclaredField(\"h\"),#hField.setAccessible(true),#aopProxy=#hField.get(#this),#advisedField=#aopProxy.getClass().getDeclaredField(\"advised\"),#advisedField.setAccessible(true),1==1?#advisedField.get(#aopProxy).getTargetSource().getTarget():null],#nonProxyResultFunc = :[!#isProxy(#this) ? #this :#isJdkDynamicProxy(#this)? #isJdkDynamicProxy(#this) : #cglibTarget(#this)],#nonProxyTarget=#nonProxyResultFunc(target),#nonProxyTarget'  -x 1 -i 1001",
  },
  { label: '获取第一个参数 params[0]', command: 'tt -w params[0]  -x 3 -i 1000' },
  { label: '先记录一次 Spring MVC 调用（获取 context 前置）', command: 'tt -t org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter invokeHandlerMethod' },
  { label: "通过 tt 获取 Spring context", command: "tt -w 'target.getApplicationContext()' -x 3 -i 1000" },
  { label: '列出所有时间片段 (tt -l)', command: 'tt -l' },
  { label: '删除所有时间片段', command: 'tt --delete-all' },
];
