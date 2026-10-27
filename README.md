# Arthas VSCode

**English** | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Generate and copy [Arthas](https://arthas.aliyun.com/doc/en/) commands right from your editor. Place the cursor on a Java class / method / field / enum, right-click **"Arthas Command"**, and the matching `watch` / `trace` / `tt` / `ognl` / `vmtool` / `sc` / `sm` / `jad` command is generated from the code context and copied to the clipboard.

Feature set ported from [arthas-idea-plugin](https://github.com/WangJi92/arthas-idea-plugin) (the IntelliJ version); command templates match the original plugin one by one.

## Feature Overview

### Basic commands (right-click "Arthas Command" menu, shown dynamically per cursor context)

| Command | Notes |
| --- | --- |
| Watch | `watch C m '{params,returnObj,throwExp}' -n 5 -x 3`; on a field it auto-upgrades to the static `@C@f` / instance `target.f` variants |
| Trace / Stack / Monitor | Method timing chain / call stack / invocation statistics (defaults such as `--skipJDKMethod false`, `--cycle` aligned with the original plugin) |
| TimeTunnel Tt | `tt -t C m -n 5`, followed by 11 optional follow-up commands (replay, `-w` expressions, getting the Spring Context, AOP proxy target, ...) |
| Vmtool | Get an instance and invoke methods/fields; modify instance fields (setter / reflection / final-field reflection variants) |
| Static method/field | `getstatic`, `ognl '@C@method(defaultParams)'`, reflection-based static field modification (incl. removing `final`), static OGNL snippets, enum ognl |
| Spring trio | Static Spring Context invoke / Watch invoke / Tt invoke, each with an **AOP proxy target** variant command |
| Spring properties | vmtool/ognl read of the selected property key (default `spring.profiles.active`) and of all property sources |
| Jad / Sc / Sm / Dump | Decompile, inspect classes (incl. classloader hash), methods, dump bytecode |
| Logger | `logger --name X --level debug`; name from selection → class at cursor → `ROOT` |
| Misc | dashboard / heapdump / thread / jvm / perfcounter / vmoption / classloader / 30+ preset commands (mybatis SQL, JDBC, forceGc, profiler...) |
| Install/Help | Copy arthas install scripts, curated doc links, extension settings |

Supports **Lombok**: `@Data`/`@Setter` infer setter existence; `@Value`, `@Accessors(fluent = true)`, `@Setter(AccessLevel.NONE)` are correctly excluded.

### Quickly Get Available Command

`Ctrl+Shift+P` → `Arthas: Quickly Get Available Command` (or the first item of the context menu): filters every applicable command for the current cursor context, shows the full command string in the QuickPick, and copies on selection — equivalent to the IDEA plugin's "Quickly Get Available Command" dialog.

### Mybatis Mapper XML Hot Reload

Right-click a single mapper `.xml` in the Explorer (or in an XML editor / via the Command Palette) to generate a **self-contained one-liner script** and copy it: the script installs arthas on the target server → selects a pid → decodes the xml → resolves the classloader hash via `sc -d` → invokes the reload service bean via ognl. The notification offers **Save script to file** (then scp it) and **Open doc**.

Prerequisites:

1. A configured static Spring Context (`arthas.staticSpringContextOgnl` set to a non-default value);
2. The **target application must contain the reload service**: add [`mybatis-mapper-reload-spring-boot-start`](https://github.com/WangJi92/mybatis-mapper-reload-spring-boot-start) (bean/method names configurable). [Chinese docs](https://www.yuque.com/arthas-idea-plugin/help/ctgcbg).

## Context Resolution

- **Primary path**: uses the DocumentSymbol API of [Language Support for Java(TM) by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) for accurate code structure (recommended).
- **Fallback path**: built-in lightweight text parser, used automatically when the Java extension is absent or the file is opened standalone.
- Recognizes: package, inner classes (`Outer$Inner`), anonymous classes (`Foo*$*` wildcard), constructors (`<init>`), static/final modifiers, method parameter types → OGNL default arguments, `@Component("x")` Spring bean names, setters, enum constants.

Deliberate difference from the IDEA plugin: the cursor **inside a method body** counts as that method (the original requires the method name), which is more intuitive.

## Settings (`File → Preferences → Settings → Arthas`)

| Setting | Default | Notes |
| --- | --- | --- |
| `arthas.invokeCount` | 5 | `-n` for watch/trace/stack/tt |
| `arthas.monitorCount` / `arthas.monitorInterval` | 10 / 10 | `-n` and `--cycle` for monitor |
| `arthas.depth` | 3 | `-x` expansion depth |
| `arthas.printConditionExpress` | false | Append `-v` |
| `arthas.conditionExpressDisplay` | false | Append the `'1==1'` condition express |
| `arthas.traceSkipJdk` | false | When false, trace appends `--skipJDKMethod false` |
| `arthas.staticSpringContextOgnl` | `@applicationContextProvider@context` | **Static Spring Context ognl**; set to a non-default value (e.g. `@com.demo.ApplicationContextProvider@context`) to enable the static-Spring commands |
| `arthas.autoToUnicode` | true | Convert Chinese characters to `\uXXXX` when copying |
| `arthas.showCopyNotification` | true | Post-copy notification (carries the "Open doc / AOP variant" buttons); click **Don't show again** on it to mute |
| `arthas.manualSelectPid` | true | Interactive `jps` pid selection inside generated scripts; when off, `selectProjectName` is used directly |
| `arthas.selectProjectName` | empty | `--select` value for generated scripts (`jps -l` process name) |
| `arthas.arthasZipDownloadUrl` | arthas official URL | arthas zip download URL used by generated scripts (swap for intranet mirrors) |
| `arthas.mybatis.reloadBeanName` | `mybatisMapperXmlFileReloadService` | Mybatis reload service bean name (app must contain it) |
| `arthas.mybatis.reloadMethodName` | `reloadAllSqlSessionFactoryMapper` | Mybatis reload service method name |

## Development

```bash
npm install
npm run compile           # esbuild bundle to out/
npm test                  # mocha unit tests
npm run test-integration  # real VSCode host integration tests (base + Lombok suites)
```

- `F5` to debug in the Extension Development Host
- `npx @vscode/vsce package` to build a .vsix

### Integration tests

`npm run test-integration` launches a real VSCode instance via [@vscode/test-electron](https://code.visualstudio.com/api/working-with-extensions/testing-extension), opens `test/fixtures/Demo.java` in the extension host, moves the cursor / selects text, runs the same commands as the context menu, and asserts the full command strings written to the clipboard.

- **Reuses the local VSCode** by default (common install paths auto-detected; override with `VSCODE_EXECUTABLE_PATH`); downloads a stable VSCode into `.vscode-test/` when not found (slow the first time).
- The test instance uses an isolated profile under `.vscode-test/` — your local VSCode settings and extensions are untouched.
- By default it covers the **text-parser fallback path** (java language assigned via `setTextDocumentLanguage`, no Java extension needed).
- Run `node tools/setup-redhat.js` once to register the local redhat.java into the test instance: the base suite then also covers the **DocumentSymbol primary path**, and the **Lombok suite** is appended automatically (`@Data`/`@Builder` fixtures; method-name normalization, annotated-field range matching, Lombok setter inference, synthetic Builder class filtering). Put a lombok jar in `test/fixtures-lombok/lib/` to enable full annotation processing (jar not committed).

### Project layout

```
src/
├── extension.ts        # command registration, dynamic menu visibility (context keys), UI flows
├── java/               # Java context analysis (symbolProvider primary + textParser fallback + default values)
├── command/            # command template engine (templates / commandContext / constantCommands / ttCommands)
├── script/             # one-click bash script foundation (templates + one-liner generation)
├── mybatis/            # Mybatis mapper xml hot reload flow
├── util/               # QuickPick/InputBox, clipboard, i18n
└── settings.ts         # configuration reader
```

## Differences from the IDEA plugin

- The stray `#` before `instances[0]` in the vmtool setter command was removed (likely a typo in the original template; every other variant and the official docs omit it).
- One-click scripts (Mybatis reload etc.) are distributed via clipboard or saved file only; OSS/S3/Redis delivery and the Arthas Tunnel terminal are not ported. Hot swap redefine/retransform can be added on the same script foundation.
- Accidental double spaces caused by optional parameters are collapsed to single spaces (functionally equivalent).

## License

[MIT](LICENSE)
