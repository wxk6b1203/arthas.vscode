# arthas-vscode 项目实施计划

## 目标

在空白目录 `C:\Users\wxk6b\Documents\Project\arthas-vscode` 从零搭建一个 VSCode 插件：Java 编辑器中右键出现 **"Arthas Command"** 菜单，根据光标所在代码元素（类/方法/字段/静态成员/内部类/枚举/Spring Bean）生成对应 arthas 命令并复制到剪贴板。功能对齐 arthas-idea-plugin 的**核心版 + Spring 增强**（约 30 个命令 + QuickPick 快速获取 + 设置项），模板字符串与 IDEA 插件逐条对齐。

## 技术选型

- TypeScript + VSCode Extension API（`engines.vscode: ^1.85.0`）
- 构建：esbuild 打包 `out/extension.js`；npm scripts（compile / watch / test / package）
- 测试：mocha 单元测试（模板生成、默认值映射、兜底解析器）
- i18n：`package.nls.json`（英文）+ `package.nls.zh-cn.json`（中文）
- Java 上下文分析：主路径 `vscode.executeDocumentSymbolProvider`（redhat.java 提供）+ 自研轻量正则解析器兜底（未装 Java 插件或单文件打开时降级）

## 目录结构

```
arthas-vscode/
├── package.json / package.nls.json / package.nls.zh-cn.json   # 命令、菜单、配置、i18n
├── tsconfig.json / esbuild.js / .vscodeignore
├── .vscode/  (launch.json, tasks.json)
├── media/icon.png
├── src/
│   ├── extension.ts        # 激活入口：注册命令、光标监听维护 context key
│   ├── java/
│   │   ├── javaContext.ts      # 核心：光标位置 → JavaContext（类FQN含$嵌套/方法/字段/静态性/构造器/匿名类/Spring bean名）
│   │   ├── symbolProvider.ts   # redhat.java DocumentSymbol 主路径
│   │   ├── fallbackParser.ts   # 正则兜底解析器
│   │   ├── defaultValue.ts     # 参数类型 → OGNL 默认值映射表
│   │   └── springUtils.ts      # @Component/@Service("x") 提取 bean 名
│   ├── command/
│   │   ├── commandContext.ts   # 模板变量表构建 + 替换（对应 IDEA CommandContext）
│   │   ├── templates.ts        # 全部命令模板+适用性谓词（对应 ShellScriptCommandEnum）
│   │   ├── constantCommands.ts # ~36 条固定预设命令（对应 ShellScriptConstantEnum）
│   │   ├── ttCommands.ts       # tt 后续命令（对应 TimeTunnelCommandEnum）
│   │   └── handlers/           # 各 VSCode 命令实现（watch.ts, trace.ts, ognl.ts, ...）
│   ├── ui/
│   │   ├── quickPick.ts        # "快速获取可用命令"（等价 IDEA 动态对话框）
│   │   └── inputBox.ts         # 可编辑命令 → 复制（等价 IDEA 各 Dialog）
│   ├── util/ (clipboard.ts, unicode.ts, notify.ts)
│   └── settings.ts             # 配置读取（带默认值）
├── test/                     # mocha 单测 + fixtures/*.java
├── README.md / CHANGELOG.md / LICENSE
```

## 核心模块设计

### 1. Java 上下文分析（替代 IDEA PSI）

`resolveJavaContext(document, position)` 返回：
- `className`：`com.a.b.Outer$Inner`（`$` 连接内部类链）；匿名类 → `com.a.b.Foo*$*`
- `kind`：class / method / field / constructor（方法名==类简单名→`<init>`）/ enum
- `methodName`：光标在方法→方法名，在类/文件→`*`
- `fieldName`、`isStatic`、`isFinal`、`hasSetter`（类内是否有 `setXxx`）
- `methodParams: string[]`（从方法签名解析，用于生成默认参数）
- `springBeanName`：注解 value 或首字母小写简单类名

实现要点：
- **静态性识别**：DocumentSymbol 的 detail 不含修饰符，用 symbol selectionRange 所在声明行文本 regex `\bstatic\b` / `\bfinal\b` 判断
- **方法参数**：优先用 symbol detail 签名（如 `method(String, int): void`），不可靠时解析声明行
- **OGNL 默认值映射**（移植 IDEA 映射表）：boolean→`true`、String→`" "`、int→`0`、long→`0L`、double→`0D`、float→`0F`、char→`'c'`、数组→`new T[]{}`、List/Set/Map→`(#list=new java.util.ArrayList(),#list.add(v),#list)` 系、BigDecimal→`(#p=@java.math.BigDecimal@valueOf(1L),#p)`、Date/LocalDateTime→`now()`、枚举→`@Enum@FIRST`、未知 POJO→`(#p=null,#p)`
- **兜底解析器**：package 声明 + 大括号深度扫描 class/interface/enum/method/field，标注 best-effort

### 2. 命令生成引擎（模板与 IDEA 逐条对齐）

`commandContext.ts` 构建变量表并做 `${VAR}` 替换：`CLASS_NAME, METHOD_NAME, FIELD_NAME, EXECUTE_INFO`（字段名或 `method(默认参数)`）、`SPRING_BEAN_NAME, SPRING_CONTEXT, PROPERTY_DEPTH, INVOKE_COUNT, PRINT_CONDITION_RESULT(-v), SKIP_JDK_METHOD, CONDITION_EXPRESS_DEFAULT('1==1'), DEFAULT_FIELD_VALUE, CAPITALIZE_FIELD_VALUE, EDITOR_SELECT_TEXT` 等。

`templates.ts` 每条命令含：模板字符串、`support(ctx)` 适用性谓词、文档链接、tip。关键模板（从 IDEA 源码逐字移植）：
- `watch ${CLASS_NAME} ${METHOD_NAME} '{params,returnObj,throwExp}' -n 5 -x 3`，字段自动升级：静态→`@C@field`，实例→`target.field` + 排除静态调用条件表达式
- `trace/stack/monitor`（含 `--skipJDKMethod false` 默认逻辑）、`tt -t C m -n 5`
- `ognl -x 3 '@C@method(默认参数)'`、`getstatic C f -x 3`、set 静态字段（final/非 final 反射变体）
- `vmtool -x 3 --action getInstances --className C --express 'instances[0].method(...)'`（setField 三变体：setter/反射/final 反射）
- `jad --source-only C [m]`、`sc -d C`、`sm [-d] C m`、`dump C -d /tmp/output`
- Spring：`ognl '#springContext=@applicationContextProvider@context,#springContext.getBean("bean").method()'`、watch/tt 变体（DispatcherServlet doDispatch / target.getApplicationContext()）
- Spring 配置：vmtool/ognl 读取选中 key（选中文本或 `spring.profiles.active`）与全量 properties
- 枚举：`@Enum@CONSTANT.method()` 系
- 固定命令：`dashboard`、`thread -i 3000 -n 5`、`jvm`、`vmoption`、`heapdump /tmp/dump.hprof`、`classloader -l`、`perfcounter -d`、`logger --name X --level debug`
- 预设（constantCommands）：DispatcherServlet 耗时、mybatis BoundSql、JDBC sql、forceGc、interruptThread、profiler 系、sysprop/env 等 ~36 条
- 安装脚本 2 条（arthas-boot alias / `curl as.sh`）

### 3. UI 与交互

- **右键菜单**：`menus.editor/context` 子菜单 "Arthas Command"（`when: editorLangId == java`），分组顺序对齐 IDEA：Watch/Trace/Stack/Monitor/Tt → Vmtool → Spring 三件套 → Static Ognl 组 → Spring Properties → Jad/Sc/Sm/Logger → Other（固定命令）→ 安装/文档/设置
- **动态显隐**（复刻 IDEA `update()` 行为）：监听 `onDidChangeTextEditorSelection`（300ms debounce）→ 解析上下文 → `setContext` 写入 `arthas.onMethod / arthas.onField / arthas.onClass / arthas.onStatic / arthas.onNonStatic / arthas.onEnum` 等 key，菜单项用 when 子句显隐（VSCode 菜单不支持置灰，只隐藏）
- **快速获取可用命令**：QuickPick 列出所有 `support(ctx)` 通过的命令 + 全部预设，detail 显示完整命令串，选中即复制（可配置编辑后复制）
- **可编辑命令**（ognl static / vmtool / set field）：`showInputBox` 预填生成结果，回车复制；logger 用 QuickPick 选 level
- **复制后通知**：`showInformationMessage("已复制: ...")`；`autoToUnicode` 选项将中文转 `\uXXXX`
- 所有命令同时注册到命令面板（`Ctrl+Shift+P`）

### 4. 设置项（contributes.configuration，workspace 级）

`arthas.invokeCount(5)`、`arthas.monitorCount(10)`、`arthas.monitorInterval(10)`、`arthas.depth(3)`、`arthas.printConditionExpress(false)`、`arthas.conditionExpressDisplay(false)`、`arthas.traceSkipJdk(false)`、`arthas.staticSpringContextOgnl("@applicationContextProvider@context")`、`arthas.autoToUnicode(true)`、`arthas.selectProjectName`、`arthas.arthasZipDownloadUrl`。Spring 功能未配置 context 时弹提示+文档链接（对齐 IDEA 行为）。

## 实施顺序

1. **脚手架**：package.json（全部命令/菜单/配置/nls 声明）、tsconfig、esbuild、.vscode 调试配置、git init、README 骨架
2. **上下文分析**：symbolProvider 主路径 + fallbackParser + defaultValue + springUtils，配 fixtures 单测
3. **命令引擎**：commandContext 变量替换 + templates 全量移植，单测对拍 IDEA 输出样例
4. **命令接入**：M1 全部命令 handler + QuickPick + 剪贴板/通知
5. **Spring 增强**：Spring 三件套、Spring 配置、枚举、预设命令、安装脚本、文档链接
6. **动态显隐 + 打磨**：context key 监听、i18n 校验、图标、CHANGELOG、`vsce package` 出 .vsix 验证

## 测试与交付

- 单测：模板生成（固定 JavaContext → 断言命令串）、defaultValue 映射、fallback parser（fixtures/*.java）
- 手动：F5 启动 Extension Development Host，在示例 Java 项目中右键逐项验证
- 交付：可安装的 .vsix + 中英 README（含使用说明与截图位）+ CHANGELOG + LICENSE(MIT，可再议)

## 风险与说明

- DocumentSymbol 的 detail 签名格式需实现时实测，不可靠则降级为声明行文本解析
- redhat.java 需项目导入完成才有 symbol；单文件/未安装场景自动走兜底解析器
- VSCode 菜单只能隐藏不能置灰，与 IDEA 的灰色禁用表现略有差异
- 重型功能（热更新 redefine、Tunnel 终端、OSS/Redis 分发、Mybatis 重载）本次不做，菜单中不出现，后续可按同样架构扩展