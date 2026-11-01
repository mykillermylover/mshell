import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * MButton's five colour variants and two shapes, checked on the compiled
 * stylesheet. The variants only set custom properties, so the risk this guards
 * against is a variant that forgot a property and silently fell back to the
 * previous one.
 */
const runs = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;

/** sass from the devShell, else through nix, else `null` to skip the suite. */
const sassCommand = (): string[] | null => {
  if (runs('sass', ['--version'])) {
    return ['sass', 'style.scss'];
  }

  if (runs('nix', ['--version'])) {
    return ['nix', 'shell', 'nixpkgs#dart-sass', '-c', 'sass', 'style.scss'];
  }

  return null;
};

/**
 * A missing sass means "skip"; a sass that runs and fails means the stylesheet
 * is broken, and that has to fail rather than be skipped as a missing tool.
 */
const compile = (): string | null => {
  const command = sassCommand();

  if (command === null) {
    return null;
  }

  const [cmd, ...args] = command;
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
  });

  assert.equal(
    result.status,
    0,
    `компиляция style.scss упала:\n${result.stderr}`,
  );

  return result.stdout;
};

const css = compile();
const skip = css === null ? 'sass недоступен' : false;

/** One rule from the output, by exact selector. */
const rule = (selector: string): string => {
  const match = css!.match(
    new RegExp(
      `${selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)} \\{([^}]*)\\}`,
    ),
  );

  assert.ok(match, `нет правила ${selector}`);

  return match[1].replaceAll(/\s+/g, ' ').trim();
};

describe('MButton', { skip }, () => {
  test('заливки filled, tonal и elevated различаются', () => {
    const containers = ['filled', 'tonal', 'elevated'].map((variant) => {
      const value = rule(`button.mbutton.${variant}`).match(/--_bg: ([^;]+);/);

      assert.ok(value, `${variant} не задаёт --_bg`);

      return value[1];
    });

    assert.equal(new Set(containers).size, containers.length);
    assert.ok(!containers.includes('transparent'));
  });

  test('filled: primary под on-primary', () => {
    const block = rule('button.mbutton.filled');

    assert.match(block, /--_bg: var\(--primary\)/);
    assert.match(block, /--_label: var\(--on_primary\)/);
  });

  test('outlined: прозрачный контейнер и рамка в 1px', () => {
    const block = rule('button.mbutton.outlined');

    assert.match(block, /--_bg: transparent/);
    assert.match(block, /border: 1px solid var\(--outline\)/);
  });

  test('text: прозрачный контейнер и никакой рамки', () => {
    const block = rule('button.mbutton.text');

    assert.match(block, /--_bg: transparent/);
    assert.doesNotMatch(block, /border:/);
  });

  test('hover — слой 8%, влитый в контейнер', () => {
    for (const variant of ['filled', 'tonal', 'elevated']) {
      assert.match(
        rule(`button.mbutton.${variant}`),
        /--_bg-hover: color-mix\(.* 8%,/,
        variant,
      );
    }

    // Nothing underneath to mix with, so the layer is the colour on its own.
    for (const variant of ['outlined', 'text']) {
      assert.match(
        rule(`button.mbutton.${variant}`),
        /--_bg-hover: color-mix\(.* 8%, transparent\);/,
      );
    }
  });

  test('hover переходит за 15ms, как hover-слой material-web', () => {
    assert.match(
      rule('button.mbutton'),
      /transition: background-color 15ms linear/,
    );
    assert.match(
      rule(
        'button.mbutton:hover, button.mbutton:active, button.mbutton:checked',
      ),
      /background-color: var\(--_bg-hover\)/,
    );
  });

  test('elevated поднимается на hover', () => {
    const rest = rule('button.mbutton.elevated');
    const hover = rule('button.mbutton.elevated:hover');

    assert.match(rest, /box-shadow:/);
    assert.match(hover, /box-shadow:/);
    assert.notEqual(
      rest.match(/box-shadow: [^;]+/)![0],
      hover.match(/box-shadow: [^;]+/)![0],
    );
  });

  test('filled покоится без тени и получает её на hover', () => {
    const rest = rule('button.mbutton.filled');
    const hover = rule('button.mbutton.filled:hover');

    assert.match(rest, /box-shadow: 0 0 0 0/);
    assert.match(hover, /box-shadow: 0 1px 2px 0/);
  });

  test('squared — 12dp для размера S, round — полное скругление', () => {
    // M3 sizes the square corner by button: XS/S 12dp, M 16dp, L/XL 28dp.
    // The container is 40dp, which is the S size.
    assert.match(rule('button.mbutton.squared'), /border-radius: 12px/);
    assert.match(rule('button.mbutton'), /border-radius: 9999px/);
  });

  test('фон Adwaita перебит: её градиент лежал поверх нашего цвета', () => {
    // The theme paints an opaque gradient on buttons in every state; without
    // the reset it covers the container colour.
    assert.match(rule('button.mbutton'), /background-image: none/);
    assert.match(
      rule(
        'button.mbutton:hover, button.mbutton:active, button.mbutton:checked',
      ),
      /background-image: none/,
    );
  });

  test('анимации нажатия в CSS нет — ею владеет ripple-виджет', () => {
    assert.doesNotMatch(css!, /mbutton-ripple/);
    assert.doesNotMatch(css!, /background-size:/);
  });

  test('disabled: текст 38%, состояния погашены', () => {
    const block = rule('button.mbutton:disabled');

    assert.match(block, /color: color-mix\(.* 38%, transparent\);/);
    assert.match(block, /background-color: transparent/);
  });
});
