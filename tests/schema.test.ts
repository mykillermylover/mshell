import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULTS,
  isLeaf,
  LIMITS,
  num,
  SCHEMA,
  text,
  values,
} from '@lib/config';
import { ThemePreference, ThemeScheme } from '@lib/theme/policy';

test('values: дефолты выводятся из схемы, форма та же', () => {
  assert.deepEqual(values(SCHEMA), DEFAULTS);
  assert.equal(DEFAULTS.theme.mode, ThemePreference.SYSTEM);
  assert.equal(DEFAULTS.theme.scheme, ThemeScheme.TONAL_SPOT);
  assert.equal(DEFAULTS.style.border, 4);
});

test('values: листья копируются по значению, а не по ссылке', () => {
  const copy = values(SCHEMA);
  copy.style.border = 99;
  assert.equal(DEFAULTS.style.border, 4, 'DEFAULTS не мутируются');
});

test('limits: выводятся из min/max и игнорируют текст', () => {
  assert.deepEqual(LIMITS.style.border, [0, 32]);
  assert.deepEqual(LIMITS.style.hoverDepth, [1, 64]);
  assert.deepEqual(LIMITS.theme.contrast, [-1, 1]);
  assert.ok(!('wallpaper' in LIMITS.theme));
  assert.ok(!('mode' in LIMITS.theme));
});

test('limits: покрывают все числовые ключи style', () => {
  const numeric = Object.keys(DEFAULTS.style).sort();
  assert.deepEqual(Object.keys(LIMITS.style).sort(), numeric);
});

test('isLeaf и билдеры: kind проставляется сам', () => {
  const spec = num({ default: 3, min: 0, max: 10, label: 'Тест', unit: 'px' });
  assert.equal(spec.kind, 'number');
  assert.ok(isLeaf(spec));
  assert.ok(!isLeaf({ nested: spec }));
  assert.equal(text({ default: '' }).kind, 'text');
});
