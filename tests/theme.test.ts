import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULTS, LIMITS, merge, reactive, SCHEMA } from '@lib/config';
import {
  isPaletteCss,
  normalizeThemePreference,
  normalizeThemeScheme,
  ThemeScheme,
} from '@lib/theme/policy';
import { isAbsolutePath } from '@lib/theme/policy';

/** As in the application: file contents → static config. */
const fromJson = (text: string) => merge(SCHEMA, JSON.parse(text));

test('theme: an unknown mode falls back to system', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('system'), 'system');
  assert.equal(normalizeThemePreference('bogus'), 'system');
  assert.equal(normalizeThemePreference(''), 'system');
});

test('path: wallpaper is accepted only as absolute', () => {
  assert.equal(isAbsolutePath('/home/u/wallpaper.jpg'), true);
  assert.equal(isAbsolutePath('~/wallpaper.jpg'), false);
  assert.equal(isAbsolutePath('$HOME/wallpaper.jpg'), false);
  assert.equal(isAbsolutePath('wallpaper.jpg'), false);
  assert.equal(isAbsolutePath(''), false);
});

test('palette: valid CSS requires surface and on_surface', () => {
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

test('config: theme.mode passes merge and does not mutate defaults', () => {
  assert.equal(DEFAULTS.theme.mode, 'system');

  const tree = fromJson('{"theme":{"mode":"dark"}}');

  assert.equal(tree.theme.mode, 'dark');
  assert.equal(DEFAULTS.theme.mode, 'system');
});

test('config: a wrong type and an unknown theme key do not pass', () => {
  const tree = fromJson('{"theme":{"mode":1,"bogus":"x"}}');

  assert.equal(tree.theme.mode, 'system');
  assert.ok(!('bogus' in tree.theme));
});

test('theme: the scheme is normalized and knows short names', () => {
  assert.equal(normalizeThemeScheme('scheme-neutral'), ThemeScheme.NEUTRAL);
  assert.equal(normalizeThemeScheme('neutral'), ThemeScheme.NEUTRAL);
  assert.equal(normalizeThemeScheme('scheme-smart'), ThemeScheme.SMART);
  assert.equal(normalizeThemeScheme('bogus'), ThemeScheme.TONAL_SPOT);
  assert.equal(normalizeThemeScheme(''), ThemeScheme.TONAL_SPOT);
});

test('theme: enum values without the prefix', () => {
  assert.equal(ThemeScheme.TONAL_SPOT, 'tonal-spot');
  assert.equal(ThemeScheme.FRUIT_SALAD, 'fruit-salad');
});

test('config: default theme parameters', () => {
  assert.equal(DEFAULTS.theme.mode, 'system');
  assert.equal(DEFAULTS.theme.scheme, 'tonal-spot');
  assert.ok(
    DEFAULTS.theme.wallpaper === '' || isAbsolutePath(DEFAULTS.theme.wallpaper),
  );
  assert.equal(DEFAULTS.theme.contrast, 0);
});

test('config: wallpaper/scheme/contrast pass merge', () => {
  const tree = fromJson(
    '{"theme":{"wallpaper":"/tmp/w.jpg","scheme":"neutral","contrast":0.5}}',
  );

  assert.equal(tree.theme.wallpaper, '/tmp/w.jpg');
  assert.equal(tree.theme.scheme, 'neutral');
  assert.equal(tree.theme.contrast, 0.5);
});

test('config: contrast is clamped by limits', () => {
  const tree = reactive({ theme: { contrast: 5 } }, () => {}, LIMITS);

  assert.equal(tree.theme.contrast(), 1);
  tree.theme.contrast.set(-5);
  assert.equal(tree.theme.contrast(), -1);
});
