#!/usr/bin/env node
/**
 * 将本机已安装的 redhat.java 复制并注册到 .vscode-test/extensions，
 * 使集成测试覆盖 DocumentSymbol 主路径，并启用 Lombok 专用套件。
 * 用法：node tools/setup-redhat.js （跑一次即可，重装 redhat.java 后重跑）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(process.env.USERPROFILE || process.env.HOME || '', '.vscode', 'extensions');
const DST = path.join(ROOT, '.vscode-test', 'extensions');

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`未找到本机扩展目录: ${SRC}`);
    process.exit(1);
  }
  const dir = fs.readdirSync(SRC).find((d) => /^redhat\.java-/.test(d));
  if (!dir) {
    console.error('本机未安装 redhat.java（~/.vscode/extensions 下未找到），先在 VSCode 中安装');
    process.exit(1);
  }
  fs.mkdirSync(DST, { recursive: true });
  const target = path.join(DST, dir);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(SRC, dir), target, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  const reg = path.join(DST, 'extensions.json');
  let entries = [];
  if (fs.existsSync(reg)) {
    try {
      entries = JSON.parse(fs.readFileSync(reg, 'utf8'));
    } catch {
      entries = [];
    }
  }
  const abs = target.split(path.sep).join('/');
  entries = entries.filter((e) => e.identifier && e.identifier.id !== 'redhat.java');
  entries.push({
    identifier: { id: 'redhat.java' },
    version: pkg.version,
    location: { $mid: 1, path: '/' + abs.replace(/^\//, ''), scheme: 'file' },
    relativeLocation: dir,
    metadata: {
      id: '198a707e-28af-4e84-8610-808272967f68',
      publisherDisplayName: 'Red Hat',
      targetPlatform: pkg.targetPlatform || 'win32-x64',
      isApplicationScoped: false,
      isPreReleaseVersion: false,
    },
  });
  fs.writeFileSync(reg, JSON.stringify(entries, null, 2));
  console.log(`已复制并注册 ${dir} → .vscode-test/extensions`);
  console.log('可选：放置 lombok jar 到 test/fixtures-lombok/lib/ 以启用完整注解处理');
}

main();
