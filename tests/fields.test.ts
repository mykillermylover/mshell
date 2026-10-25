import { type Config, type ConfigMethods, DEFAULTS, fields, LIMITS, reactive, SCHEMA, } from '@lib/config';
import assert from 'node:assert/strict';
import test from 'node:test';

const noop = () => {};

/** Конфиг как в приложении, без GJS: реактивное дерево + заглушка методов. */
function makeConfig(): Config {
  const methods: ConfigMethods = {
    update: noop,
    subscribe: () => noop,
    flush: noop,
  };

  return Object.assign(
    {},
    reactive(structuredClone(DEFAULTS), () => {
    }, LIMITS),
    methods,
  ) as Config;
}

test('fields: покрывает каждый лист схемы', () => {
  const config = makeConfig();
  const list = fields(config);

  const expected: string[] = [];
  for (const [section, node] of Object.entries(SCHEMA)) {
    for (const key of Object.keys(node)) {
      expected.push(`${section}.${key}`);
    }
  }

  assert.deepEqual(
    list.map((f) => `${f.section}.${f.key}`),
    expected,
  );
});

test('fields: kind совпадает со спекой, метаданные на месте', () => {
  const list = fields(makeConfig());
  const border = list.find((f) => f.key === 'border');

  assert.ok(border);
  assert.equal(border.kind, 'number');
  assert.equal(border.label, 'Рамка');
  if (border.kind === 'number') {
    assert.equal(border.unit, 'px');
    assert.equal(border.min, 0);
    assert.equal(border.max, 32);
  }

  const mode = list.find((f) => f.key === 'mode');
  assert.ok(mode);
  assert.equal(mode.kind, 'choice');
  if (mode.kind === 'choice') {
    assert.ok(mode.options.includes('dark'));
  }
});

test('fields: set меняет дерево, value читает его', () => {
  const config = makeConfig();
  const border = fields(config).find((f) => f.key === 'border');

  assert.ok(border && border.kind === 'number');
  assert.equal(border.value(), 4);

  border.set(9);
  assert.equal(config.style.border(), 9);
  assert.equal(border.value(), 9);

  // зажим лимитами работает и через поле
  border.set(999);
  assert.equal(config.style.border(), 32);
});

test('fields: choice.set пишет enum-значение', () => {
  const config = makeConfig();
  const mode = fields(config).find((f) => f.key === 'mode');

  assert.ok(mode && mode.kind === 'choice');
  mode.set('dark');
  assert.equal(config.theme.mode(), 'dark');
});
