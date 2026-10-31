import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * Compile the shell stylesheet and check what GTK will actually receive.
 *
 * The rules under test live in SCSS, so a string match on the source would
 * pass even if Sass never emitted them. Only the compiled output is evidence.
 *
 * `sass` comes from the devShell. Fall back to `nix shell` so the test also
 * runs where direnv has not been evaluated, and skip when neither is present
 * rather than failing `npm test` on a machine without nix.
 */
const compile = (): string | null => {
  const direct = spawnSync('sass', ['style.scss'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (direct.status === 0) {
    return direct.stdout;
  }

  const nix = spawnSync(
    'nix',
    ['shell', 'nixpkgs#dart-sass', '-c', 'sass', 'style.scss'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 180_000 },
  );
  return nix.status === 0 ? nix.stdout : null;
};

const css = compile();
const skip = css === null ? 'sass недоступен' : false;

describe('focus ring', { skip }, () => {
  test('компилируется, а не падает на синтаксисе', () => {
    assert.ok(css && css.length > 1000);
  });

  test('рамка M3: 3px с отступом 2px наружу', () => {
    assert.match(css!, /outline:\s*3px solid/);
    assert.match(css!, /outline-offset:\s*2px/);
  });

  test('анимация двухфазная: выпрыгивает до 8px и оседает', () => {
    assert.match(css!, /@keyframes fd-grow/);
    assert.match(css!, /@keyframes fd-settle/);
    assert.match(css!, /animation-duration:[^;]*calc\(600ms \* 0\.75\)/);
  });

  test('на интерактивных виджетах, а не на всём подряд', () => {
    assert.match(css!, /button:focus-visible/);
    assert.match(css!, /entry:focus-visible/);
  });

  test('не рисует рамку на корне окна и служебных узлах', () => {
    // The window content root is focusable for tab isolation, so a bare
    // `:focus-visible` would draw a ring around the whole window.
    assert.doesNotMatch(css!, /^:focus-visible \{/m);
    assert.doesNotMatch(css!, /^\*:focus-visible \{/m);
  });

  test('не гасит фокус на кнопках воркспейсов', () => {
    assert.doesNotMatch(css!, /outline:\s*unset/);
  });

  test('гасит фокус Adwaita на trough слайдера', () => {
    assert.match(css!, /scale trough \{[^}]*outline-style:\s*none/);
  });

  test('уважает prefers-reduced-motion в форме, понятной GTK', () => {
    assert.match(css!, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
