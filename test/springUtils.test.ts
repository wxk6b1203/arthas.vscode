import * as assert from 'assert';
import { beanNameFromAnnotations, uncapitalize } from '../src/java/springUtils';

describe('beanNameFromAnnotations', () => {
  const cases: Array<{ annotations: string[]; classSimpleName: string; expected: string; note?: string }> = [
    { annotations: ['@Service("userService")'], classSimpleName: 'UserService', expected: 'userService' },
    { annotations: ['@org.springframework.stereotype.Component("x")'], classSimpleName: 'Foo', expected: 'x', note: '全限定注解名' },
    { annotations: ['@Service(name = "named")'], classSimpleName: 'FooService', expected: 'named', note: 'name 属性' },
    { annotations: ['@Component(value="v")'], classSimpleName: 'Foo', expected: 'v', note: 'value 属性' },
    { annotations: ['@Component'], classSimpleName: 'Foo', expected: 'foo', note: '无参 → 首字母小写' },
    { annotations: ['@Configuration("cfg")'], classSimpleName: 'AppCfg', expected: 'cfg' },
    { annotations: ['@RestController'], classSimpleName: 'ApiController', expected: 'apiController' },
    { annotations: ['@Service'], classSimpleName: 'XService', expected: 'xService' },
    { annotations: ['@Repository("orderDao")'], classSimpleName: 'OrderDao', expected: 'orderDao' },
    { annotations: [], classSimpleName: 'Plain', expected: 'plain', note: '无注解 → 首字母小写' },
    { annotations: ['@Service("中文名")'], classSimpleName: 'Foo', expected: '中文名', note: '中文 bean 名' },
    { annotations: ['@Component("UserService2")'], classSimpleName: 'Foo', expected: 'UserService2', note: '显式名保持大小写' },
    { annotations: ['@Component("")'], classSimpleName: 'Foo', expected: 'foo', note: '空串值 → 回退默认名' },
    { annotations: ['@GetMapping("/x")'], classSimpleName: 'Foo', expected: 'foo', note: '非 stereotype 注解忽略' },
    {
      annotations: ['@Nullable', '@Component("multi")', '@Deprecated'],
      classSimpleName: 'Foo',
      expected: 'multi',
      note: '多注解中取 stereotype',
    },
  ];

  for (const c of cases) {
    it(`${JSON.stringify(c.annotations)} + ${c.classSimpleName} → ${c.expected}${c.note ? `（${c.note}）` : ''}`, () => {
      assert.strictEqual(beanNameFromAnnotations(c.annotations, c.classSimpleName), c.expected);
    });
  }
});

describe('uncapitalize', () => {
  it('首字母小写，其余不变', () => {
    assert.strictEqual(uncapitalize('UserService'), 'userService');
    assert.strictEqual(uncapitalize('A'), 'a');
    assert.strictEqual(uncapitalize('x'), 'x');
    assert.strictEqual(uncapitalize(''), '');
  });
});
