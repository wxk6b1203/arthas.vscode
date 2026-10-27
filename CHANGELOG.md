# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-10-27

### Added

- 首个版本：功能对齐 arthas-idea-plugin 的核心命令 + Spring 增强。
- 右键 "Arthas 命令" 菜单：按光标上下文（类/方法/字段/静态/内部类/匿名类/枚举/Spring Bean）动态显示可用命令并复制。
- 命令：watch（字段自动变体）/ trace / stack / monitor / tt（含 11 条后续命令）/ vmtool（调用/修改字段三变体）/ getstatic / ognl 静态调用与反射修改 / 静态 OGNL 语法片段 / 枚举 ognl。
- Spring：静态 Context 调用、Watch/Tt 调用（附 AOP 代理目标变体）、读取选中/全量 Spring 配置。
- 搜索类：jad / sc / sm / dump / logger / classloader；固定命令：dashboard / heapdump / thread / jvm / perfcounter / vmoption。
- 30+ 常用预设命令（mybatis BoundSql、JDBC 慢 SQL、forceGc、profiler、vmoption GC 系列等）。
- "快速获取可用命令" QuickPick；arthas 安装脚本复制；特殊用法文档链接。
- Java 上下文识别：redhat.java DocumentSymbol 主路径 + 内置文本解析器兜底。
- 设置项与 IDEA 插件对齐（-n / -x / --cycle / -v / '1==1' / --skipJDKMethod / 静态 Spring Context / 中文转 unicode 等）。
- 中英双语（package.nls + 运行时跟随 VSCode 语言）。
