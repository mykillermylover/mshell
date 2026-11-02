import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * Radii and transitions must come from the M3 scales, not from literals.
 * Checked on the compiled stylesheet: the tokens are Sass, and a value that
 * never reaches the output is indistinguishable from one that was never set.
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

describe('shape tokens', { skip }, () => {
  test('скругления не остались литералами шкалы, которой нет', () => {
    assert.doesNotMatch(css!, /border-radius:\s*6px/);
    assert.doesNotMatch(css!, /border-radius:\s*10px/);
  });

  test('corner-full — 9999px', () => {
    // `round` is the M3 default, so the radius sits on the base rule and only
    // `.squared` overrides it.
    assert.match(css!, /button\.mbutton \{[^}]*border-radius:\s*9999px/);
  });

  test('составное скругление dropdown из шкалы', () => {
    assert.match(css!, /border-radius:\s*12px 12px 0 0/);
  });
});

describe('motion tokens', { skip }, () => {
  test('никаких CSS-ключевых слов ease не осталось', () => {
    assert.doesNotMatch(css!, /transition:[^;]*\bease(-in-out|-in|-out)?\b/);
  });

  test('dropdown: вход и выход на разных кривых M3', () => {
    const exit = css!.match(
      /\.dropdown button\.dropdown-selected \{[^}]*transition:[^;]*cubic-bezier\([^)]*\)/,
    );
    const enter = css!.match(
      /\.dropdown button\.dropdown-selected\.opened \{[^}]*transition-timing-function:\s*cubic-bezier\([^)]*\)/,
    );

    assert.ok(exit, 'нет transition на кнопке dropdown');
    assert.ok(enter, 'нет своей кривой у .opened');
    assert.notEqual(
      exit![0].match(/cubic-bezier\([^)]*\)/)![0],
      enter![0].match(/cubic-bezier\([^)]*\)/)![0],
    );
  });
});
