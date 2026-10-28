# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-10-28

### Added

- **Mybatis Mapper XML 热重载**：资源管理器右键单个 mapper `.xml`（或 xml 编辑器右键 / 命令面板）生成自包含一键脚本并复制——脚本自动安装 arthas → 选 pid → 解码 xml → `sc -d` 取 classloader hash → ognl 调用重载 bean；通知支持「保存脚本到文件」「打开文档」。需配置静态 Spring Context 且目标应用内置 [mybatis-mapper-reload-spring-boot-start](https://github.com/WangJi92/mybatis-mapper-reload-spring-boot-start)。
- 一键脚本底座（`src/script/`）：`plugin-common-function.sh` / `mybatis-mapper-xml-reload.sh` 模板（token 化为 `%VAR%`，bash `${...}` 原样保留，强制 LF + `.gitattributes`）、`buildOneLiner` 一行命令生成（对齐 IDEA DirectScriptUtils 剪贴板模式）——后续热更新 redefine/retransform 复用同一底座。
- 设置项：`arthas.selectProjectName`、`arthas.manualSelectPid`、`arthas.arthasZipDownloadUrl`（一键脚本用，此前因"未使用"移除，现已实际启用）、`arthas.mybatis.reloadBeanName`、`arthas.mybatis.reloadMethodName`。

## [Unreleased]

### Changed

- README 改为英文为主（市场页），中文版拆分至 `README.zh-CN.md`，两文件顶部互链；目录结构补齐 script/mybatis 模块。
- 性能：文档掩码文本（maskJavaText）与结构模型一并按 document.version 缓存，光标移动不再每次全文重扫。
- 菜单 context key 更新加轮次守卫，快速移动光标时旧轮次自动放弃，消除交错写入的混合菜单状态。
- 激活时机改为 `onStartupFinished`：此前插件仅在首次执行命令时激活，激活前 context key 未设置，右键菜单的 Watch/Trace 等项全部隐藏。

### Fixed

- redhat.java 预热期间 `executeDocumentSymbolProvider` 长时间挂起导致 context key 更新卡死（菜单项一直不显示）：符号请求加 500ms 超时，超时立即退回文本解析，且不缓存兜底结果以便预热完成后自动恢复符号路径。
- 「插件设置」跳转使用完整扩展 ID（`context.extension.id`，如 `wxk6b1203.arthas-vscode`）；此前写死 `@ext:arthas-vscode`，`@ext:` 过滤器匹配不到。
- 补齐 10 条预设命令（vmoption 系列等）缺失的英文标签；新增元测试固化 nls 键对齐、命令/菜单注册、双语标签覆盖，防止单侧改动漂移。

### Added

- 复制成功通知新增「不再提示」按钮：一键关闭提示（写入全局设置 `arthas.showCopyNotification`，命令仍正常复制），并附「重新开启」反悔入口；设置页可手动开关。
- 集成测试（`npm run test-integration`）：@vscode/test-electron 拉起本机 VSCode（找不到则自动下载），在真实扩展宿主中端到端验证激活、光标上下文识别（方法/构造器/静态字段/内部类/匿名类/枚举/选中文本）与剪贴板命令输出。
- Lombok 支持：`@Data`/`@Setter` 字段推断 setter 存在（vmtool.setField 恢复 setter 变体、Spring getBeanSetField 不再隐藏）；`@Value`、`@Accessors(fluent = true)`、`@Setter(AccessLevel.NONE)` 正确排除。
- Lombok 主路径集成套件：`node tools/setup-redhat.js` 将本机 redhat.java 复制注册进测试实例后自动运行（含方法名归一化、注解字段区间、@Builder 合成类过滤等回归用例）。

### Fixed

- 与光标无关的命令（dashboard/heapdump/thread/jvm/perfcounter/vmoption/classloader/logger/安装脚本/Spring 配置读取）不再要求 Java 光标上下文：命令面板可随时执行，右键菜单不再因光标在 import 等位置而隐藏。
- 快速命令面板中「Ognl 调用枚举」改为弹出变体选择框（与右键菜单完整流程一致），此前会直接复制第一个变体。
- Spring 三件套（静态 Context / Watch / Tt 调用）显隐条件对齐原插件：仅实例方法/实例字段可用（类级、静态方法不再显示）。
- redhat.java 符号路径适配（jdt.ls 实测发现）：
  - 方法/构造器符号名携带参数（如 `hello(String)`）导致生成无效命令，归一化为纯成员名；
  - 含注解字段 range 起始于注解行，光标在声明行识别失败，改为区间匹配；
  - 类/字段注解自 range 首行开始，`@Component`/`@Data` 取不到（Spring bean 名错误、Lombok 推断失效），注解收集补齐注解块；
  - lombok `@Builder` 生成的合成嵌套类（FooBuilder）劫持光标行，按源码声明验证过滤。
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
