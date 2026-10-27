/**
 * 常用预设命令（逐字移植 ShellScriptConstantEnum）。
 */
export interface ConstantCommand {
  label: string;
  /** 英文标签（扩展层用 t(label, labelEn) 选择显示语言） */
  labelEn?: string;
  command: string;
  docUrl?: string;
}

export const constantCommands: ConstantCommand[] = [
  {
    label: 'watch Spring HTTP 请求耗时 (>1s)',
    labelEn: 'watch Spring HTTP request cost (>1s)',
    command: 'watch org.springframework.web.servlet.DispatcherServlet doService \'{params[0].getRequestURI()+" "+ #cost}\'  -n 5  -x 3 \'#cost>1\'',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/80',
  },
  {
    label: 'watch Spring HTTP 全部 Header',
    labelEn: 'watch Spring HTTP all headers',
    command: 'watch org.springframework.web.servlet.DispatcherServlet doService \'#httpRequest=params[0],#allHeaders={},#forEnumeration = :[#this.hasMoreElements()? (#headerName=#this.nextElement(),#allHeaders.add(#headerName+"="+#httpRequest.getHeader(#headerName)),#forEnumeration(#this)):null],#forEnumeration(#httpRequest.getHeaderNames()),#allHeaders\'  -n 5  -x 3',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/102',
  },
  {
    label: 'watch Spring HTTP 请求/响应 Header',
    labelEn: 'watch Spring HTTP request/response headers',
    command: 'watch org.springframework.web.servlet.DispatcherServlet doService \'{params[0].getRequestURI()+"  header="+params[1].getHeaders("trace-id")}\'  -n 10  -x 3 -f',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/80',
  },
  {
    label: 'watch Mybatis BoundSql（SQL 与参数）',
    labelEn: 'watch Mybatis BoundSql (SQL & params)',
    command: 'watch org.apache.ibatis.mapping.BoundSql getSql \'{returnObj,target.parameterObject,throwExp}\'  -n 5  -x 3',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/80',
  },
  {
    label: 'watch JDBC prepareStatement（mysql 慢 SQL）',
    labelEn: 'watch JDBC prepareStatement (mysql slow SQL)',
    command: 'watch java.sql.Connection prepareStatement \'{params,throwExp}\'  -n 5  -x 3  \'clazz.getName().startsWith("com.mysql") and params.length==1\' and #cost>1 ',
    docUrl: 'https://github.com/WangJi92/arthas-idea-plugin/issues/80',
  },
  {
    label: 'vmtool 强制 GC',
    labelEn: 'vmtool force GC',
    command: 'vmtool --action forceGc',
    docUrl: 'https://arthas.aliyun.com/doc/vmtool.html',
  },
  {
    label: 'vmtool 中断指定线程（thread 命令取 id）',
    labelEn: 'vmtool interrupt thread (get id via thread cmd)',
    command: 'vmtool --action interruptThread -t 1',
    docUrl: 'https://arthas.aliyun.com/doc/vmtool.html',
  },
  {
    label: 'thread 批量（TopN/死锁/BLOCKED）',
    labelEn: 'thread batch (TopN/deadlock/BLOCKED)',
    command: 'thread -i 3000 -n 5;thread -b;thread --state BLOCKED;',
    docUrl: 'https://arthas.aliyun.com/doc/thread.html',
  },
  {
    label: 'profiler CPU 采样（JFR 格式，3 分钟）',
    labelEn: 'profiler CPU sampling (JFR, 3 min)',
    command: 'profiler start --event cpu --interval 10000000 --format jfr --duration 180',
    docUrl: 'https://github.com/alibaba/arthas/issues/1416',
  },
  {
    label: 'profiler 内存分配采样（HTML 火焰图）',
    labelEn: 'profiler alloc sampling (HTML flame graph)',
    command: 'profiler start --event alloc --interval 10000000 --threads --format html --duration 180 --threads',
    docUrl: 'https://arthas.aliyun.com/doc/profiler.html',
  },
  {
    label: 'profiler CPU 火焰图（HTML）',
    labelEn: 'profiler CPU flame graph (HTML)',
    command: 'profiler start --event cpu --interval 10000000 --threads --format html --duration 180 --threads',
    docUrl: 'https://arthas.aliyun.com/doc/profiler.html',
  },
  {
    label: 'heapdump 堆转储',
    labelEn: 'heapdump heap dump',
    command: 'heapdump /tmp/dump.hprof',
    docUrl: 'https://arthas.aliyun.com/doc/heapdump.html',
  },
  {
    label: 'jvm 信息',
    labelEn: 'jvm information',
    command: 'jvm',
    docUrl: 'https://arthas.aliyun.com/doc/jvm.html',
  },
  {
    label: 'classloader URL 统计（应用瘦身排查）',
    labelEn: 'classloader URL stats (app slimming)',
    command: 'classloader --url-stat',
    docUrl: 'https://mp.weixin.qq.com/s/ePc807eHs5vVMbuCfGpLzQ',
  },
  {
    label: 'classloader 信息批量',
    labelEn: 'classloader info batch',
    command: 'classloader;classloader -l;classloader -t;',
    docUrl: 'https://arthas.aliyun.com/doc/classloader.html',
  },
  {
    label: 'memory 内存信息',
    labelEn: 'memory information',
    command: 'memory',
    docUrl: 'https://mp.weixin.qq.com/s/ePc807eHs5vVMbuCfGpLzQ',
  },
  {
    label: 'mbean 内存/线程/操作系统',
    labelEn: 'mbean memory/thread/OS',
    command: 'mbean java.lang:type=Memory;mbean java.lang:type=MemoryPool,name=* Usage;mbean java.nio:type=BufferPool,name=*;mbean java.lang:type=Threading;mbean java.lang:type=OperatingSystem;',
    docUrl: 'https://arthas.aliyun.com/doc/mbean.html',
  },
  {
    label: 'mbean GC 与编译',
    labelEn: 'mbean GC and compilation',
    command: 'mbean java.lang:type=GarbageCollector,name=*;mbean java.lang:type=Compilation;',
    docUrl: 'https://arthas.aliyun.com/doc/mbean.html',
  },
  {
    label: 'options unsafe true（增强 java.* 类）',
    labelEn: 'options unsafe true (enhance java.* classes)',
    command: 'options unsafe true',
    docUrl: 'https://arthas.aliyun.com/doc/options.html',
  },
  {
    label: 'options json-format true（JSON 输出）',
    labelEn: 'options json-format true (JSON output)',
    command: 'options json-format true',
    docUrl: 'https://arthas.aliyun.com/doc/options.html',
  },
  {
    label: 'dashboard -n 1（单次快照）',
    labelEn: 'dashboard -n 1 (single snapshot)',
    command: 'dashboard -n 1',
    docUrl: 'https://arthas.aliyun.com/doc/dashboard.html',
  },
  {
    label: 'sysprop + sysenv',
    labelEn: 'sysprop + sysenv',
    command: 'sysprop;sysenv;',
    docUrl: 'https://arthas.aliyun.com/doc/sysenv.html',
  },
  {
    label: 'vmoption',
    labelEn: 'vmoption',
    command: 'vmoption',
    docUrl: 'https://arthas.aliyun.com/doc/vmoption.html',
  },
  {
    label: 'vmoption PrintGC true',
    labelEn: 'vmoption PrintGC true',
    command: 'vmoption PrintGC true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption PrintGCDetails true',
    labelEn: 'vmoption PrintGCDetails true',
    command: 'vmoption PrintGCDetails true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption PrintGCDateStamps true',
    labelEn: 'vmoption PrintGCDateStamps true',
    command: 'vmoption PrintGCDateStamps true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption HeapDumpBeforeFullGC true',
    labelEn: 'vmoption HeapDumpBeforeFullGC true',
    command: 'vmoption HeapDumpBeforeFullGC true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption HeapDumpAfterFullGC true',
    labelEn: 'vmoption HeapDumpAfterFullGC true',
    command: 'vmoption HeapDumpAfterFullGC true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption PrintClassHistogramBeforeFullGC true',
    labelEn: 'vmoption PrintClassHistogramBeforeFullGC true',
    command: 'vmoption PrintClassHistogramBeforeFullGC true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'vmoption PrintClassHistogramAfterFullGC true',
    labelEn: 'vmoption PrintClassHistogramAfterFullGC true',
    command: 'vmoption PrintClassHistogramAfterFullGC true',
    docUrl: 'https://mp.weixin.qq.com/s/GF3C7RcEPV0f1hDah6CJPA',
  },
  {
    label: 'perfcounter -d',
    labelEn: 'perfcounter -d',
    command: 'perfcounter -d',
    docUrl: 'https://arthas.aliyun.com/doc/perfcounter.html',
  },
];
