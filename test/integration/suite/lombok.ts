/**
 * Lombok 主路径套件入口（扩展宿主内运行）：
 * 需要 .vscode-test/extensions 中存在 redhat.java，否则 lombok.test 内部跳过。
 */
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 120000 });
  mocha.addFile(path.join(__dirname, 'lombok.test.js'));
  const failures = await new Promise<number>((resolve) => mocha.run(resolve));
  if (failures > 0) {
    throw new Error(`${failures} 个 Lombok 集成测试未通过`);
  }
}
