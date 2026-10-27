# Arthas VSCode

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

在 VSCode 中一键生成并复制 [Arthas](https://arthas.aliyun.com/) 命令。将光标放在 Java 类/方法/字段/枚举上，右键 **"Arthas 命令"** 即可按上下文生成 `watch` / `trace` / `tt` / `ognl` / `vmtool` / `sc` / `sm` / `jad` 等命令并复制到剪贴板。

功能参考 [arthas-idea-plugin](https://github.com/WangJi92/arthas-idea-plugin)（IDEA 版）移植，命令模板与原插件逐条对齐。

## 功能总览

### 基础命令（右键 "Arthas 命令" 菜单，按光标上下文动态显示）

| 命令 | 说明 |
| --- | --- |
| Watch | `watch C m '{params,returnObj,throwExp}' -n 5 -x 3`；光标在字段上自动升级为静态字段 `@C@f` / 实例字段 `target.f` 变体 |
| Trace / Stack / Monitor | 方法耗时链路 / 调用栈 / 调用统计（`--skipJDKMethod false`、`--cycle` 等对齐原插件默认值） |
| TimeTunnel Tt | `tt -t C m -n 5`，复制后可继续选择 11 条 tt 后续命令（回放、`-w` 观察、获取 Spring Context、AOP 代理目标等） |
| Vmtool | 获取实例调用方法/字段；修改实例字段（setter / 反射 / final 反射三变体） |
| 静态方法/字段 | `getstatic`、`ognl '@C@method(默认参数)'`、反射修改静态字段（含去 final）、静态 OGNL 语法片段、枚举 ognl |
| Spring 三件套 | 静态 Spring Context 调用 / Watch 调用 / Tt 调用，均附带 **AOP 代理目标** 变体命令 |
| Spring 配置 | vmtool/ognl 读取选中配置项（默认 `spring.profiles.active`）与全量 PropertySource |
| Jad / Sc / Sm / Dump | 反编译、查看类（含 classloader hash）、方法、dump 字节码 |
| Logger | `logger --name X --level debug`，名称取自选中文本 → 光标类名 → ROOT |
| 其他 | dashboard / heapdump / thread / jvm / perfcounter / vmoption / classloader / 30+ 常用预设命令（mybatis SQL、JDBC、forceGc、profiler…） |
| 安装/帮助 | 复制 arthas 安装脚本、特殊用法文档链接、插件设置 |

### 快速获取可用命令

`Ctrl+Shift+P` → `Arthas: 快速获取可用命令`（或右键菜单第一项）：根据当前光标上下文过滤出所有可用命令，QuickPick 中展示完整命令串，选中即复制——等价 IDEA 插件的 "Quickly Get Available Command" 对话框。

## 上下文识别

- **主路径**：调用 [Language Support for Java(TM) by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) 的 DocumentSymbol 获取准确代码结构（推荐安装）。
- **兜底路径**：内置轻量文本解析器，未安装 Java 插件或单文件打开时自动降级。
- 识别能力：包名、内部类（`Outer$Inner`）、匿名类（`Foo*$*` 通配）、构造器（`<init>`）、静态/.final 修饰、方法参数类型→OGNL 默认实参、`@Component("x")` Spring Bean 名、setter 检测、枚举常量。

与 IDEA 插件的行为差异：光标在**方法体内**时视为该方法（IDEA 原版需要点在方法名上），更符合直觉。

## 设置（`文件 → 首选项 → 设置 → Arthas`）

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `arthas.invokeCount` | 5 | watch/trace/stack/tt 的 `-n` 次数 |
| `arthas.monitorCount` / `arthas.monitorInterval` | 10 / 10 | monitor 的 `-n` 与 `--cycle` |
| `arthas.depth` | 3 | `-x` 展开层级 |
| `arthas.printConditionExpress` | false | 追加 `-v` |
| `arthas.conditionExpressDisplay` | false | 追加 `'1==1'` 条件表达式 |
| `arthas.traceSkipJdk` | false | false 时 trace 追加 `--skipJDKMethod false` |
| `arthas.staticSpringContextOgnl` | `@applicationContextProvider@context` | **静态 Spring Context ognl**，改为非默认值后启用静态 Spring 相关命令（如 `@com.demo.ApplicationContextProvider@context`） |
| `arthas.autoToUnicode` | true | 复制时中文自动转 `\uXXXX` |
| `arthas.selectProjectName` | 空 | 生成一键脚本时的 `--select` 默认值 |
| `arthas.arthasZipDownloadUrl` | arthas 官方地址 | arthas zip 包下载地址 |

## 开发

```bash
npm install
npm run compile     # esbuild 打包到 out/
npm test            # mocha 单元测试（61 个用例）
```

- `F5` 启动 Extension Development Host 调试
- `npx @vscode/vsce package` 打包 .vsix

### 目录结构

```
src/
├── extension.ts        # 命令注册、菜单动态显隐(context key)、交互流程
├── java/               # Java 上下文分析（symbolProvider 主路径 + textParser 兜底 + 默认值映射）
├── command/            # 命令模板引擎（templates/commandContext/constantCommands/ttCommands）
├── ui/ + util/         # QuickPick/InputBox、剪贴板、i18n
└── settings.ts         # 配置读取
```

## 与原 IDEA 插件的差异

- vmtool setter 修改字段命令中 `instances[0]` 前的 `#` 已移除（原插件模板疑似笔误，同文件其余变体与官方文档均为无 `#` 写法）。
- 重型功能（热更新 redefine/retransform、Mybatis XML 重载、OSS/S3/Redis 分发、Arthas Tunnel 终端）暂未移植，可按现有架构扩展。
- 命令中因可选参数产生的连续空格收敛为单空格（功能等价）。

## License

[MIT](LICENSE)
