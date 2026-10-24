import assert from 'node:assert/strict';
import test from 'node:test';

import { type DeepPartial, DEFAULTS, merge } from '@lib/config';
import { isPaletteCss, normalizeThemePreference } from '@lib/theme/policy';

/** Как в приложении: содержимое файла → статика конфига. */
const fromJson = (text: string) =>
  merge(DEFAULTS, JSON.parse(text) as DeepPartial<typeof DEFAULTS>);

test('theme: неизвестный режим сводится к system', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('system'), 'system');
  assert.equal(normalizeThemePreference('bogus'), 'system');
  assert.equal(normalizeThemePreference(''), 'system');
});

test('palette: валидный CSS требует surface и on_surface', () => {
  const valid = `
    :root { --surface: #111318; --on_surface: #e2e2e9; }
    @media (prefers-color-scheme: dark) {
      :root { --surface: #f9f9ff; --on_surface: #1a1c20; }
    }
  `;

  assert.equal(isPaletteCss(valid), true);
  assert.equal(isPaletteCss(':root { --surface: #111318; }'), false);
  assert.equal(isPaletteCss(':root { --on_surface: #e2e2e9; }'), false);
  assert.equal(isPaletteCss(''), false);
});

test('config: theme.mode проходит merge и не мутирует дефолты', () => {
  assert.equal(DEFAULTS.theme.mode, 'system');

  const tree = fromJson('{"theme":{"mode":"dark"}}');

  assert.equal(tree.theme.mode, 'dark');
  assert.equal(DEFAULTS.theme.mode, 'system');
});

test('config: чужой тип и неизвестный ключ theme не проходят', () => {
  const tree = fromJson('{"theme":{"mode":1,"bogus":"x"}}');

  assert.equal(tree.theme.mode, 'system');
  assert.ok(!('bogus' in tree.theme));
});
