# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- 集成测试（`npm run test-integration`）：@vscode/test-electron 拉起本机 VSCode（找不到则自动下载），在真实扩展宿主中端到端验证激活、光标上下文识别（方法/构造器/静态字段/内部类/匿名类/枚举/选中文本）与剪贴板命令输出。

### Fixed

- 与光标无关的命令（dashboard/heapdump/thread/jvm/perfcounter/vmoption/classloader/logger/安装脚本/Spring 配置读取）不再要求 Java 光标上下文：命令面板可随时执行，右键菜单不再因光标在 import 等位置而隐藏。
- 快速命令面板中「Ognl 调用枚举」改为弹出变体选择框（与右键菜单完整流程一致），此前会直接复制第一个变体。
- Spring 三件套（静态 Context / Watch / Tt 调用）显隐条件对齐原插件：仅实例方法/实例字段可用（类级、静态方法不再显示）。
- redhat.java 符号路径的 static/final 修饰符判定改为遮蔽字符串/注释后解析，避免声明行字符串/注释中出现 "static"/"final" 时误判。

### Changed

- 运行时 QuickPick/InputBox/通知文案全面双语（跟随 VSCode 显示语言）。
- `vscode:prepublish` 改为 `--production` 压缩打包；`.vscodeignore` 排除 `*.vsix` / `*.map`。

### Removed

- 删除未使用的配置项 `arthas.selectProjectName` / `arthas.arthasZipDownloadUrl`（对应一键脚本功能未移植）。

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
