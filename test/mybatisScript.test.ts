import * as assert from 'assert';
import { fillTemplate } from '../src/script/bashTemplates';
import { buildOneLiner, base64Of } from '../src/script/oneLiner';
import { buildMybatisOgnlCommand, buildMybatisScript, MYBATIS_SCRIPT_FILE_NAME } from '../src/script/mybatisScript';

const INPUT = {
  xmlBase64: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+', // <?xml version="1.0"?>
  xmlFileName: 'UserMapper.xml',
  depth: '3',
  springContextOgnl: '@com.demo.ApplicationContextProvider@context',
  springContextClassName: 'com.demo.ApplicationContextProvider',
  beanName: 'mybatisMapperXmlFileReloadService',
  methodName: 'reloadAllSqlSessionFactoryMapper',
  arthasZipUrl: 'https://arthas.aliyun.com/download/latest_version?mirror=aliyun',
  selectValue: '',
};

describe('fillTemplate', () => {
  it('替换 %TOKEN%，保留 bash 的 ${...} 运行期变量', () => {
    const out = fillTemplate('SELECT_VALUE=%SELECT_VALUE%\nX="${TARGET_PID}"\nY=${1}', { SELECT_VALUE: 'demo-app' });
    assert.strictEqual(out, 'SELECT_VALUE=demo-app\nX="${TARGET_PID}"\nY=${1}');
  });
  it('未提供的 token 原样保留（便于发现遗漏）', () => {
    assert.strictEqual(fillTemplate('A=%FOO%', {}), 'A=%FOO%');
  });
  it('CRLF 归一为 LF', () => {
    assert.strictEqual(fillTemplate('a=%A%\r\nb', { A: 'x' }), 'a=x\nb');
  });
});

describe('buildOneLiner', () => {
  it('格式与 IDEA DirectScriptUtils 一致', () => {
    const out = buildOneLiner('hello', 'f.sh');
    assert.strictEqual(out, `echo "${base64Of('hello')}" | base64 --decode >f.sh;chmod a+x f.sh;./f.sh;`);
  });
});

describe('buildMybatisOgnlCommand', () => {
  it('生成带 $CLASSLOADER_HASH_VALUE 的 ognl 命令', () => {
    assert.strictEqual(
      buildMybatisOgnlCommand(INPUT),
      `ognl -x 3 '#springContext=@com.demo.ApplicationContextProvider@context,` +
        `#springContext.getBean("mybatisMapperXmlFileReloadService").` +
        `reloadAllSqlSessionFactoryMapper("$HOME/opt/arthas/mybatis/mapper/UserMapper.xml")' -c $CLASSLOADER_HASH_VALUE`,
    );
  });
});

describe('buildMybatisScript', () => {
  const result = buildMybatisScript(INPUT);

  it('以 shebang 开头、LF 行尾', () => {
    assert.ok(result.script.startsWith('#!/usr/bin/env bash\n'));
    assert.ok(!result.script.includes('\r\n'));
  });

  it('无残留 %TOKEN% 占位符', () => {
    assert.ok(!/%[A-Z0-9_]{3,}%/.test(result.script), result.script.match(/%[A-Z0-9_]{3,}%/)?.[0]);
  });

  it('SC_COMMAND / BASE64_TXT_AND_PATH 填充正确', () => {
    assert.ok(result.script.includes('SC_COMMAND="sc -d com.demo.ApplicationContextProvider"'));
    assert.ok(result.script.includes(`BASE64_TXT_AND_PATH=${INPUT.xmlBase64}|$HOME/opt/arthas/mybatis/mapper/UserMapper.xml`));
  });

  it('交互模式 select 为空；指定时填充', () => {
    assert.ok(result.script.includes('SELECT_VALUE=\n'));
    const withSelect = buildMybatisScript({ ...INPUT, selectValue: 'demo-app' });
    assert.ok(withSelect.script.includes('SELECT_VALUE=demo-app\n'));
  });

  it('ognl 命令内嵌双引号已转义为 \\"', () => {
    const line = result.script.split('\n').find((l) => l.includes('executeArthasCommand "${HOME}/opt/arthas/mybatisMapperXmlReloadResult.out"'));
    assert.ok(line, '应存在 doStartMybatisMapperReloadCommand 调用行');
    assert.ok(line!.includes('\\"mybatisMapperXmlFileReloadService\\"'), 'bean 名双引号应转义');
    assert.ok(line!.includes('\\\"$HOME/opt/arthas/mybatis/mapper/UserMapper.xml\\"'), 'mapper 路径双引号应转义');
    assert.ok(line!.includes('-c $CLASSLOADER_HASH_VALUE'), 'classloader hash 由脚本运行期展开');
  });

  it('one-liner base64 可还原回脚本全文', () => {
    const m = /^echo "([^"]+)" \| base64 --decode >(.+);chmod a\+x .+;\.\/.+;$/.exec(result.oneLiner);
    assert.ok(m, 'one-liner 格式');
    assert.strictEqual(m![2], MYBATIS_SCRIPT_FILE_NAME);
    assert.strictEqual(Buffer.from(m![1], 'base64').toString('utf8'), result.script);
  });
});
