/**
 * 集成测试引导（扩展宿主内运行）：由 --extensionTestsPath 调用，run() 抛错即视为失败。
 */
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 60000 });
  mocha.addFile(path.join(__dirname, 'extension.test.js'));
  const failures = await new Promise<number>((resolve) => mocha.run(resolve));
  if (failures > 0) {
    throw new Error(`${failures} 个集成测试未通过`);
  }
}
