import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * The elevation mixin is shared: whoever needs a shadow next will call it
 * instead of copying the table. So the scale is checked on its own, not only
 * through the button that happens to use levels 1 and 2 today.
 */
const FIXTURE = `
@use 'elevation' as e;

@for $i from 0 through 5 {
  .lvl-#{$i} { @include e.elevation($i); }
}
`;

/** Key and ambient shadow for each level, as md-sys-elevation defines them. */
const EXPECTED: Record<number, [string, string]> = {
  0: ['0 0 0 0', '0 0 0 0'],
  1: ['0 1px 2px 0', '0 1px 3px 1px'],
  2: ['0 1px 2px 0', '0 2px 6px 2px'],
  3: ['0 1px 3px 0', '0 4px 8px 3px'],
  4: ['0 2px 3px 0', '0 6px 10px 4px'],
  5: ['0 4px 4px 0', '0 8px 12px 6px'],
};

/** The sass command line, or `null` when neither the devShell nor nix has one. */
const sassCommand = (): string[] | null => {
  const args = ['--stdin', '--load-path', 'styles', '--no-source-map'];

  if (spawnSync('sass', ['--version'], { encoding: 'utf8' }).status === 0) {
    return ['sass', ...args];
  }

  const nix = ['nix', 'shell', 'nixpkgs#dart-sass', '-c', 'sass', '--version'];
  if (spawnSync(nix[0], nix.slice(1), { encoding: 'utf8' }).status === 0) {
    return ['nix', 'shell', 'nixpkgs#dart-sass', '-c', 'sass', ...args];
  }

  return null;
};

/**
 * Compiles the fixture. A missing sass means "skip"; a sass that runs and
 * fails means the mixin is broken, and that has to fail the test rather than
 * be skipped as if the toolchain were absent.
 */
const compileFixture = (): string | null => {
  const command = sassCommand();

  if (command === null) {
    return null;
  }

  const [cmd, ...args] = command;
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    input: FIXTURE,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `компиляция фикстуры упала:\n${result.stderr}`,
  );

  return result.stdout;
};

const css = compileFixture();
const skip = css === null ? 'sass недоступен' : false;

/** One level's rule, with the colour stripped so only the geometry is compared. */
const block = (level: number): string => {
  const match = css!.match(new RegExp(`\\.lvl-${level} \\{([^}]*)\\}`));

  assert.ok(match, `нет правила .lvl-${level}`);

  return match[1]
    .replaceAll(/color-mix\([^)]*\)/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
};

describe('elevation mixin', { skip }, () => {
  for (const [level, [key, ambient]] of Object.entries(EXPECTED)) {
    test(`уровень ${level}: key и ambient из md-sys-elevation`, () => {
      const rule = block(Number(level));

      assert.ok(rule.includes(key), `нет key-тени «${key}»: ${rule}`);
      assert.ok(
        rule.includes(ambient),
        `нет ambient-тени «${ambient}»: ${rule}`,
      );
    });
  }

  test('обе тени берут цвет из палитры, а не литералом', () => {
    assert.match(css!, /var\(--shadow\)/);
    assert.doesNotMatch(css!, /rgba\(/);
  });
});
