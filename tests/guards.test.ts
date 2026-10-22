import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isEqual } from '../src/lib/config/guards.ts';

test('примитивы сравниваются по значению', () => {
  assert.equal(isEqual(12, 12), true);
  assert.equal(isEqual(12, 13), false);
  assert.equal(isEqual('a', 'b'), false);
  assert.equal(isEqual(true, true), true);
});

test('объекты с одинаковыми данными равны, даже если это разные ссылки', () => {
  const first = { style: { border: 4, screenRadius: 10 } };
  const second = { style: { border: 4, screenRadius: 10 } };

  assert.notEqual(first, second); // разные ссылки — это и проверяем
  assert.equal(isEqual(first, second), true);
});

test('разница во вложенном значении или в наборе ключей — не равны', () => {
  assert.equal(isEqual({ a: { b: 1 } }, { a: { b: 2 } }), false);
  assert.equal(isEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(isEqual({ a: 1 }, {}), false);
});

test('объект и примитив не равны', () => {
  assert.equal(isEqual({}, 4), false);
  assert.equal(isEqual(4, null), false);
});
