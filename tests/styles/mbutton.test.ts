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

  test('active — слой 12% поверх hover, как в material-web', () => {
    // material-web keeps hover and press as two independent layers and lets
    // them stack, so a press under the pointer reads 8% + 12%, not 12%.
    // The layer colour is the content role in every variant, which is exactly
    // what `--_label` already holds - filled on-primary, tonal
    // on-secondary-container, the rest primary.
    for (const variant of ['filled', 'tonal', 'elevated', 'outlined', 'text']) {
      assert.match(
        rule(`button.mbutton.${variant}`),
        /--_label: var\(--/,
        variant,
      );
    }

    // No per-variant pressed colour: it would be the same token as `--_label`.
    assert.doesNotMatch(css!, /--_bg-active/);

    const active = rule('button.mbutton:active');

    assert.match(active, /background-color: var\(--_bg\)/);

    // A translucent 12% layer, not an opaque pre-mixed colour: translucency is
    // what lets it stack on the hover layer the way material-web does.
    assert.match(
      active,
      /radial-gradient\(circle at var\(--_rx, 50%\) var\(--_ry, 50%\), color-mix\(in srgb, var\(--_label\) 12%, transparent\)/,
    );
    // The hover layer stays under the press rather than being blanked.
    assert.match(
      rule('button.mbutton:active:hover'),
      /background-color: var\(--_bg-hover\)/,
    );
  });

  test('hover переходит за 75ms, как у Colloid', () => {
    assert.match(
      rule('button.mbutton'),
      /transition: background-color 75ms cubic-bezier\(0, 0, 0\.2, 1\)/,
    );
    // `:active` is not in this list: the pressed layer is the ripple gradient,
    // and a flat `--_bg-hover` under it would stack a second 12%.
    assert.match(
      rule('button.mbutton:hover, button.mbutton:checked'),
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
    // The theme paints an opaque gradient on buttons in every state; ours has
    // to replace it outright or the container colour is never seen.
    assert.match(rule('button.mbutton'), /background-image: radial-gradient\(/);
  });

  test('ripple растёт от точки нажатия', () => {
    // The gradient box is the button, so `at <press point>` is in button
    // coordinates and stays put for the whole growth. `circle` sizes against
    // the farthest corner of that box, so a 100% stop is exactly what reaches
    // the far corner from the press point, wherever it landed.
    const rest = rule('button.mbutton');

    // At rest the gradient is transparent everywhere. The stops have to match
    // the animated ones so that the fade-out only moves the colour, not the
    // geometry - otherwise the circle would grow while it fades.
    assert.match(
      rest,
      /background-image: radial-gradient\(circle at var\(--_rx, 50%\) var\(--_ry, 50%\), transparent 65%, transparent 100%\)/,
    );
    assert.match(rest, /background-position: 0 0/);
    assert.match(rest, /background-size: 100% 100%/);
    // Load-bearing: `:active` ends when the pointer goes up, which removes the
    // animation at once, so the colour can only fade out by transition.
    // 375ms is material-web's ripple fade-out.
    assert.match(rest, /background-image 375ms linear/);

    const active = rule('button.mbutton:active');

    // A translucent 12% layer of the content role, so it stacks on the hover
    // layer rather than replacing it.
    assert.match(
      active,
      /background-image: radial-gradient\(circle at var\(--_rx, 50%\) var\(--_ry, 50%\), color-mix\(in srgb, var\(--_label\) 12%, transparent\) 0%, transparent 0%\)/,
    );
    // 450ms and the standard curve, as material-web's ripple.
    assert.match(
      active,
      /animation: mripple 450ms cubic-bezier\(0\.2, 0, 0, 1\) forwards/,
    );
    // The press must not be eased into: the animation owns the motion.
    assert.match(active, /background-image 0ms/);

    // What grows is the colour stop, not the box - that is what keeps the
    // centre on the press point.
    //
    // The solid stop ends at 65% and fades to 100%: material-web's soft edge.
    // Both stops interpolate together, so the edge stays a proportional 35% of
    // the radius at every stage, not just at the end.
    const keyframes = css!
      .slice(css!.indexOf('@keyframes mripple'))
      .replaceAll(/\s+/g, ' ');
    assert.match(
      keyframes,
      /to \{ background-image: radial-gradient\(circle at var\(--_rx, 50%\) var\(--_ry, 50%\), color-mix\(in srgb, var\(--_label\) 12%, transparent\) 65%, transparent 100%\);/,
    );
  });

  test('disabled: текст 38%, состояния погашены', () => {
    const block = rule('button.mbutton:disabled');

    assert.match(block, /color: color-mix\(.* 38%, transparent\);/);
    assert.match(block, /background-color: transparent/);
  });
});
