import * as assert from 'assert';
import type { Uri } from 'vscode';
import { normalizeDefinitions, pickWorkspaceDefinition } from '../src/java/referenceResolver';

function fileUri(path: string): Uri {
  return { scheme: 'file', path, toString: () => `file://${path}` } as unknown as Uri;
}

function declRange(line: number): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return { start: { line, character: 4 }, end: { line, character: 12 } };
}

const helperUri = fileUri('/ws/src/com/example/Helper.java');
const appUri = fileUri('/ws/src/com/example/AppContextUtil.java');

describe('referenceResolver', () => {
  it('兼容 Location / Location[] / LocationLink[] 三种返回形态', () => {
    const location = { uri: appUri, range: declRange(31) };
    assert.deepStrictEqual(normalizeDefinitions(location), [{ uri: appUri, range: declRange(31) }]);
    assert.strictEqual(normalizeDefinitions([location]).length, 1);
    assert.strictEqual(
      normalizeDefinitions([
        { targetUri: helperUri, targetRange: declRange(5), targetSelectionRange: declRange(6) },
      ]).length,
      1,
    );
  });

  it('LocationLink 优先 targetSelectionRange（声明名），缺省回退 targetRange', () => {
    const withSelection = normalizeDefinitions([
      { targetUri: helperUri, targetRange: declRange(5), targetSelectionRange: declRange(6) },
    ]);
    assert.deepStrictEqual(withSelection[0].range, declRange(6));
    const withoutSelection = normalizeDefinitions({ targetUri: helperUri, targetRange: declRange(5) });
    assert.deepStrictEqual(withoutSelection[0].range, declRange(5));
  });

  it('非法/空定义被忽略', () => {
    assert.deepStrictEqual(normalizeDefinitions(undefined), []);
    assert.deepStrictEqual(normalizeDefinitions(null), []);
    assert.deepStrictEqual(normalizeDefinitions([]), []);
    assert.deepStrictEqual(normalizeDefinitions([{ uri: helperUri }, { range: declRange(1) }]), []);
  });

  it('只选工作区内 .java 目标：jdt://、jar、非 Java 文件跳过', () => {
    const result = [
      { uri: { scheme: 'jdt', path: '/jdk/String.java' }, range: declRange(1) },
      { uri: fileUri('/ws/lib/dep.jar!/Foo.java'), range: declRange(2) },
      { uri: fileUri('/ws/src/com/example/notes.txt'), range: declRange(3) },
      { uri: appUri, range: declRange(31) },
    ];
    const picked = pickWorkspaceDefinition(result, (uri) => uri.path.startsWith('/ws/src/'));
    assert.ok(picked);
    assert.strictEqual(picked!.uri.path, '/ws/src/com/example/AppContextUtil.java');
    assert.strictEqual(picked!.range.start.line, 31);
  });

  it('没有工作区 Java 目标时返回 null（JDK 引用保留外层方法兜底）', () => {
    const result = [{ uri: { scheme: 'jdt', path: '/jdk/PrintStream.java' }, range: declRange(1) }];
    assert.strictEqual(pickWorkspaceDefinition(result, () => true), null);
  });
});
