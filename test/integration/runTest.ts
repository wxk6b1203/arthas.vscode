/**
 * 集成测试启动器（Node 侧，宿主外运行）。
 * 优先复用本机已安装的 VSCode（--extensionDevelopmentPath 方式加载扩展）；
 * 找不到时由 @vscode/test-electron 自动下载 stable 版到 .vscode-test/。
 * 可用环境变量 VSCODE_EXECUTABLE_PATH 显式指定可执行文件路径。
 */
import * as fs from 'fs';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function findLocalVSCode(): string | undefined {
  const override = process.env.VSCODE_EXECUTABLE_PATH;
  if (override) {
    return fs.existsSync(override) ? override : undefined;
  }
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    candidates.push(
      path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Visual Studio Code.app/Contents/MacOS/Electron');
  } else {
    candidates.push('/usr/share/code/code', '/usr/bin/code');
  }
  return candidates.find((p) => p && fs.existsSync(p));
}

async function main(): Promise<void> {
  const vscodeExecutablePath = findLocalVSCode();
  console.log(
    vscodeExecutablePath
      ? `[test-integration] 使用本机 VSCode: ${vscodeExecutablePath}`
      : '[test-integration] 未找到本机 VSCode，将下载 stable 版到 .vscode-test/（首次较慢）',
  );
  const exitCode = await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: ROOT,
    extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
    launchArgs: [path.join(ROOT, 'test', 'fixtures')],
  });
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error('[test-integration] 运行失败:', err);
  process.exit(1);
});
