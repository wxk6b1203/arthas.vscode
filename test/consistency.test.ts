/**
 * 元测试（防漂移）：package.json / nls / 命令注册 / 菜单引用 / 双语标签 的一致性。
 * 任何一侧单独改动（加命令、删配置、漏翻译）都会在此失败。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { commandDefs } from '../src/command/templates';
import { constantCommands } from '../src/command/constantCommands';
import { ttCommands } from '../src/command/ttCommands';

const EXT = 'arthas-vscode';
/** extension.ts 中手工注册（不走 commandDefs）的命令 id 后缀 */
const MANUAL_COMMANDS = ['quick', 'presets', 'docs', 'openSettings', 'mybatis.reload'];

function readJson(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), name), 'utf8'));
}

const pkg = readJson('package.json');
const pkgRaw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
const nlsEn = readJson('package.nls.json');
const nlsZh = readJson('package.nls.zh-cn.json');

describe('consistency: nls 双语文件', () => {
  it('中英键集合完全一致', () => {
    const en = new Set(Object.keys(nlsEn));
    const zh = new Set(Object.keys(nlsZh));
    assert.deepStrictEqual([...en].filter((k) => !zh.has(k)), []);
    assert.deepStrictEqual([...zh].filter((k) => !en.has(k)), []);
  });

  it('package.json 中所有 %key% 引用均可解析', () => {
    const refs = [...new Set([...pkgRaw.matchAll(/%([a-zA-Z0-9_.-]+)%/g)].map((m) => m[1]))];
    const missing = refs.filter((k) => !(k in nlsEn) || !(k in nlsZh));
    assert.deepStrictEqual(missing, [], `nls 缺少这些键: ${missing.join(', ')}`);
  });
});

describe('consistency: 命令注册', () => {
  const commandIds: string[] = pkg.contributes.commands.map((c: { command: string }) => c.command);
  const defIds = new Set(commandDefs.map((d) => d.id));

  it('每个进菜单的 def 都已声明为 VSCode 命令', () => {
    const missing = commandDefs
      .filter((d) => d.inMenu !== false)
      .map((d) => `${EXT}.${d.id}`)
      .filter((id) => !commandIds.includes(id));
    assert.deepStrictEqual(missing, [], `package.json 缺少这些命令: ${missing.join(', ')}`);
  });

  it('每个声明的命令要么是 def，要么在手工注册清单中', () => {
    const unknown = commandIds.filter((id) => {
      const suffix = id.replace(`${EXT}.`, '');
      return !defIds.has(suffix) && !MANUAL_COMMANDS.includes(suffix);
    });
    assert.deepStrictEqual(unknown, [], `未实现的命令: ${unknown.join(', ')}`);
  });

  it('菜单引用的命令/子菜单均存在', () => {
    const submenus = new Set(pkg.contributes.submenus.map((s: { id: string }) => s.id));
    const bad: string[] = [];
    for (const [menu, entries] of Object.entries<any[]>(pkg.contributes.menus)) {
      for (const e of entries) {
        if (e.command && !commandIds.includes(e.command)) {
          bad.push(`${menu} -> ${e.command}`);
        }
        if (e.submenu && !submenus.has(e.submenu)) {
          bad.push(`${menu} -> submenu ${e.submenu}`);
        }
      }
    }
    assert.deepStrictEqual(bad, []);
  });

  it('菜单 when 子句中的 arthas.cmd.* 键都对应真实 def', () => {
    const allowed = new Set(['arthas.springConfigured']);
    const bad: string[] = [];
    for (const entries of Object.values<any[]>(pkg.contributes.menus)) {
      for (const e of entries) {
        if (!e.when) {
          continue;
        }
        for (const m of e.when.matchAll(/arthas\.cmd\.([\w.]+)/g)) {
          const key = `arthas.cmd.${m[1]}`;
          if (!allowed.has(key) && !defIds.has(m[1])) {
            bad.push(key);
          }
        }
      }
    }
    assert.deepStrictEqual([...new Set(bad)], []);
  });
});

describe('consistency: 双语标签', () => {
  const hasCJK = (s: string): boolean => /[\u4e00-\u9fff]/.test(s);

  it('每个命令 def 都有非空中英标签', () => {
    const bad = commandDefs
      .filter((d) => !d.label || !d.labelEn || hasCJK(d.labelEn))
      .map((d) => d.id);
    assert.deepStrictEqual(bad, [], `缺 label/labelEn 或 labelEn 含中文: ${bad.join(', ')}`);
  });

  it('每条预设命令 / tt 后续命令都有非空中英标签', () => {
    const badPresets = constantCommands.filter((c) => !c.label || !c.labelEn || hasCJK(c.labelEn)).map((c) => c.label);
    assert.deepStrictEqual(badPresets, [], `预设缺标签: ${badPresets.join(', ')}`);
    const badTt = ttCommands.filter((c) => !c.label || !c.labelEn || hasCJK(c.labelEn)).map((c) => c.label);
    assert.deepStrictEqual(badTt, [], `tt 后续缺标签: ${badTt.join(', ')}`);
  });
});
