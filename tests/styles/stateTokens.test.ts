import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * State-layer opacities must match Material 3's md-sys-state: hover 8%,
 * pressed 12%. Checked on the compiled stylesheet because the tokens live in
 * Sass - the source can look right while the emitted CSS never got the value.
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

describe('state tokens', { skip }, () => {
  test('hover — 8%, как md-sys-state', () => {
    assert.match(css!, /\.pin-button:hover \{[^}]*var\(--on_surface\) 8%/);
  });

  test('pressed — 12%, как md-sys-state', () => {
    assert.match(css!, /\.pin-button:active \{[^}]*var\(--on_surface\) 12%/);
  });

  test('старого значения 20% не осталось', () => {
    assert.doesNotMatch(css!, /var\(--on_surface\) 20%/);
  });
});
