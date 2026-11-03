import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * MSwitch is a restyled GtkSwitch: GTK draws the track and the knob, the
 * stylesheet gives them M3 sizes and colours. The rules live in SCSS, so only
 * the compiled output is evidence - a token that never reaches the CSS is
 * indistinguishable from one that was never written.
 *
 * The knob is positioned by margins, not by a layout of our own: GtkSwitch
 * allocates it half the track wide and moves it by `handle_pos`, so the
 * margin is what turns that half into the M3 size. Those four margin sets are
 * measured against GTK and must not drift.
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

/** A whole `@keyframes` block: nested, so `[^}]*` would stop at the first `}`. */
const keyframes = (name: string): string => {
  const found = css!.match(
    new RegExp(`@keyframes ${name} \\{(?:[^{}]|\\{[^}]*\\})*\\}`),
  );

  assert.ok(found, `нет @keyframes ${name}`);

  return found![0];
};

/** The margin sets of one animation, in order. */
const keyframeMargins = (name: string) =>
  [
    ...keyframes(name).matchAll(
      /(\d+)% \{\s*margin: ([\d.-]+)px ([\d.-]+)px ([\d.-]+)px ([\d.-]+)px/g,
    ),
  ].map((m) => ({
    top: Number(m[2]),
    right: Number(m[3]),
    bottom: Number(m[4]),
    left: Number(m[5]),
  }));

describe('MSwitch', { skip }, () => {
  test('трек 52x32, полное скругление, без border', () => {
    const block = rule('switch.mswitch');

    assert.match(block, /min-width: 52px/);
    assert.match(block, /min-height: 32px/);
    assert.match(block, /border-radius: 9999px/);
    // Border сдвинул бы content box и сломал геометрию кноба: рамка - inset.
    assert.match(block, /border: none/);
    assert.match(block, /box-shadow: inset 0 0 0 2px/);
  });

  test('четыре набора margin дают 16/24/28', () => {
    // GTK отдаёт кнобу половину трека (26px); размер = 26 - margin-left - margin-right.
    assert.match(rule('switch.mswitch > slider'), /margin: 8px 2px 8px 8px/);
    assert.match(
      rule('switch.mswitch:checked > slider'),
      /margin: 4px 4px 4px -2px/,
    );
    assert.match(
      rule('switch.mswitch:active > slider'),
      /margin: 2px -4px 2px 2px/,
    );
    assert.match(
      rule('switch.mswitch:active:checked > slider'),
      /margin: 2px 2px 2px -4px/,
    );
  });

  test('выбранный: primary-трек без рамки, on-primary-кноб', () => {
    const track = rule('switch.mswitch:checked');

    assert.match(track, /background-color: var\(--primary\)/);
    assert.match(track, /inset 0 0 0 2px transparent/);

    assert.match(
      rule('switch.mswitch:checked > slider'),
      /background-color: var\(--on_primary\)/,
    );
  });

  test('hover: кноб on-surface-variant, выбранный — primary-container', () => {
    assert.match(
      rule('switch.mswitch:hover > slider'),
      /background-color: var\(--on_surface_variant\)/,
    );
    assert.match(
      rule('switch.mswitch:checked:hover > slider'),
      /background-color: var\(--primary_container\)/,
    );
  });

  test('state layer 40dp — сплошное кольцо', () => {
    // 40dp вокруг кноба: off 16 -> 12, on 24 -> 8, pressed 28 -> 6.
    assert.match(
      rule('switch.mswitch:hover > slider'),
      /box-shadow: 0 0 0 12px color-mix\(in srgb, var\(--on_surface\) 8%, transparent\)/,
    );
    assert.match(
      rule('switch.mswitch:checked:hover > slider'),
      /box-shadow: 0 0 0 8px color-mix\(in srgb, var\(--primary\) 8%, transparent\)/,
    );
    assert.match(
      rule('switch.mswitch:active > slider'),
      /box-shadow: 0 0 0 6px color-mix\(in srgb, var\(--on_surface\) 12%, transparent\)/,
    );
  });

  test('disabled: трек 12%, кноб 38%, у выбранного кноб surface', () => {
    const track = rule('switch.mswitch:disabled');

    assert.match(track, /background-color: color-mix\(.* 12%, transparent\)/);
    assert.match(track, /inset 0 0 0 2px color-mix\(.* 12%, transparent\)/);

    assert.match(
      rule('switch.mswitch:disabled > slider'),
      /background-color: color-mix\(.* 38%, transparent\)/,
    );
    assert.match(
      rule('switch.mswitch:disabled:checked > slider'),
      /background-color: var\(--surface\)/,
    );
  });

  test('цвета за 67ms linear, кноб — 300ms с перелётом M3', () => {
    const track = rule('switch.mswitch');

    assert.match(track, /background-color 67ms linear/);

    const handle = rule('switch.mswitch > slider');

    assert.match(handle, /background-color 67ms linear/);
    // Позиция кноба — keyframes, не transition: аллокация GTK уже прыгнула
    // на конечную, и transition стартовал бы оттуда (перелёт в 26px).
    assert.doesNotMatch(handle, /transition:[^;]*margin/);
  });

  test('перелёт: keyframes стартуют с компенсированного margin', () => {
    // GTK ставит кноб по handle_pos (x = round(pos * 26)); первый ключ гасит
    // этот прыжок, чтобы левая грань шла 8 -> 24, а не 34 -> 24.
    assert.match(keyframes('knob-on'), /0% \{\s*margin: 8px 28px 8px -18px/);
    assert.match(keyframes('knob-on'), /100% \{\s*margin: 4px 4px 4px -2px/);
    assert.match(keyframes('knob-off'), /0% \{\s*margin: 4px -22px 4px 24px/);
    assert.match(keyframes('knob-off'), /100% \{\s*margin: 8px 2px 8px 8px/);
  });

  test('размер и позиция — разными кривыми, иначе кноб деформируется', () => {
    // Одна overshoot-кривая на оба margin'а растягивает кноб вместо переноса:
    // ширина на пике уходила бы в 26 при конечной 24. Поэтому позиция идёт
    // easeOutBack, а размер — standard; в ключах это видно как ширина,
    // монотонно растущая от 16 к 24, и левая грань, уходящая на 25.
    // Ширина = 26 - left - right, должна монотонно расти и ни разу не
    // превысить конечную 24 (это и была бы деформация). У иконок начальная
    // и конечная ширина равны 24 — тот же проход ловит их сжатие.
    for (const [name, from, to] of [
      ['knob-on', 16, 24],
      ['knob-off', 24, 16],
      ['knob-on-icons', 24, 24],
      ['knob-off-icons', 24, 24],
    ] as const) {
      const widths = keyframeMargins(name).map((m) => 26 - m.left - m.right);

      assert.equal(widths[0], from, `${name}: начальная ширина`);
      assert.equal(widths.at(-1), to, `${name}: конечная ширина`);

      for (const [i, w] of widths.entries()) {
        const prev = i === 0 ? from : widths[i - 1];

        // Монотонность в одну сторону; допуск 1px на округление ключей.
        const forward = to > from ? w >= prev - 1 : w <= prev + 1;

        assert.ok(forward, `${name}: ширина ${w} откатывается после ${prev}`);
        assert.ok(
          w <= Math.max(from, to) + 1,
          `${name}: ширина ${w} выходит за конечную`,
        );
      }
    }

    // Позиция при этом перелетает: левая грань в ON доходит до 25 при
    // конечной 24, в OFF уходит до 6.67 при конечной 8.
    const onLeft = keyframeMargins('knob-on').map((m) => 26 + m.left);

    assert.ok(Math.max(...onLeft) > 24, 'нет перелёта позиции в ON');

    const offLeft = keyframeMargins('knob-off').map((m) => m.left);

    assert.ok(Math.min(...offLeft) < 8, 'нет перелёта позиции в OFF');

    // Кноб всегда центрирован по вертикали: (32 - w) / 2.
    for (const name of [
      'knob-on',
      'knob-off',
      'knob-on-icons',
      'knob-off-icons',
    ]) {
      for (const m of keyframeMargins(name)) {
        const w = 26 - m.left - m.right;

        assert.equal(m.top, m.bottom, `${name}: верх и низ margin'а`);
        assert.ok(
          Math.abs(m.top - (32 - w) / 2) < 1.5,
          `${name}: margin-top ${m.top} не центрирует кноб ${w}`,
        );
      }
    }
  });

  test('ключи идут linear: перелёт запечён в значениях, не в кривой', () => {
    // GTK делит на (end - start); если cubic-bezier.y > 1, прогресс выходит
    // за последний ключ и деление становится нулевым. Тайминг — linear.
    assert.match(
      rule('switch.mswitch.switching:checked > slider'),
      /animation: knob-on 300ms linear/,
    );
    assert.match(
      css!.match(
        /switch\.mswitch\.switching:not\(:checked\) > slider \{([^}]*)\}/,
      )![1],
      /animation: knob-off 300ms linear/,
    );
  });

  test('до первого переключения ничего не двигается', () => {
    // Переключение включает анимацию только под `.switching`: при первом
    // монтировании состояние уже известно и ехать некуда.
    assert.doesNotMatch(
      css!,
      /switch\.mswitch:not\(:checked\) > slider \{\s*animation/,
    );
  });

  test('halo гаснет на время перелёта за 30ms', () => {
    // Тень на кнобе даёт видимый шов, пока анимированные margin меняют его
    // размер. MSwitch снимает `.switching` через 300ms, и слой возвращается.
    // Прозрачная тень той же геометрии, а не `none`: список теней
    // интерполируется только со списком, поэтому `none` включал бы слой
    // рывком. 30ms — слой уходит сразу, не тая поверх уже поехавшего кноба.
    const block = css!.match(
      /switch\.mswitch\.switching > slider \{([^}]*)\}/,
    )![1];

    assert.match(block, /box-shadow: 0 0 0 12px transparent;/);
    assert.match(block, /box-shadow 30ms linear/);
    // Список переходов перекрывает базовый, поэтому цвет кноба надо повторить.
    assert.match(block, /background-color 67ms linear/);
  });

  test('halo появляется за 150ms', () => {
    // Переход берётся из состояния, в которое входим: это правило — вход в
    // hover после перелёта (и обычный hover).
    const block = rule('switch.mswitch:hover > slider');

    assert.match(block, /box-shadow 150ms linear/);
    assert.match(block, /background-color 67ms linear/);

    // Нажатие обычно идёт вместе с hover — без явного перехода сверху оно
    // растянулось бы до 150ms. У нажатия свой, быстрый.
    assert.match(
      rule('switch.mswitch:active > slider'),
      /box-shadow 67ms linear/,
    );
  });

  test('иконки: крестик в off, галочка в on, 16dp по центру', () => {
    const off = rule('switch.mswitch.icons > slider');

    assert.match(
      off,
      /background-image: -gtk-icontheme\("window-close-symbolic"\)/,
    );
    assert.match(off, /background-size: 16px 16px/);
    assert.match(off, /background-position: center/);
    // with-icon-handle 24dp: в off кноб тоже 24.
    assert.match(off, /margin: 4px -2px 4px 4px/);

    const on = rule('switch.mswitch.icons:checked > slider');

    assert.match(
      on,
      /background-image: -gtk-icontheme\("object-select-symbolic"\)/,
    );
    assert.match(on, /color: var\(--on_primary_container\)/);
    // Та же специфичность, что у off-правила: без повторного margin кноб
    // остаётся в левом положении и в on.
    assert.match(on, /margin: 4px 4px 4px -2px/);
  });

  test('иконка в нажатом состоянии остаётся 16dp', () => {
    // Кноб растёт до 28, иконка — нет: так в md-comp-switch.
    const pressed = rule('switch.mswitch.icons:active > slider');

    assert.match(pressed, /margin: 2px -4px 2px 2px/);
    assert.doesNotMatch(pressed, /background-size/);
  });

  test('only-selected: в off кноб 16 без иконки, в on — галочка', () => {
    // material-web включает with-icon только у выбранного, поэтому off —
    // обычный кноб 16, и едет он общими ключами 16<->24, без иконных.
    const on = rule('switch.mswitch.only-selected:checked > slider');

    assert.match(
      on,
      /background-image: -gtk-icontheme\("object-select-symbolic"\)/,
    );
    assert.match(on, /color: var\(--on_primary_container\)/);
    // Размер и центровка те же, что у `.icons`: без них глиф рисуется
    // натуральным размером и выглядит вдвое крупнее.
    assert.match(on, /background-size: 16px 16px/);
    assert.match(on, /background-repeat: no-repeat/);
    assert.match(on, /background-position: center/);
    // margin не переписан: его даёт общее `:checked`, и он 24dp.
    assert.doesNotMatch(on, /margin:/);

    // Иконных правил для only-selected нет: ни off-margin 24, ни своих ключей.
    assert.doesNotMatch(css!, /only-selected:not\(:checked\)/);
    assert.doesNotMatch(css!, /only-selected\.switching/);
  });

  test('иконки: кноб 24 не ужимается, движение — своими keyframes', () => {
    // Общие ключи описывают 16<->24; с иконками кноб 24 в обоих состояниях,
    // и общий набор сжал бы его в начале перелёта. Поэтому отдельная пара,
    // где ширина постоянна, а едет только край.
    for (const name of ['knob-on-icons', 'knob-off-icons']) {
      for (const m of keyframeMargins(name)) {
        // Допуск на округление ключей до сотых.
        assert.ok(
          Math.abs(26 - m.left - m.right - 24) < 0.02,
          `${name}: ширина кноба`,
        );
      }
    }

    assert.match(
      keyframes('knob-on-icons'),
      /0% \{\s*margin: 4px 24px 4px -22px/,
    );
    assert.match(
      keyframes('knob-on-icons'),
      /100% \{\s*margin: 4px 4px 4px -2px/,
    );
    assert.match(
      keyframes('knob-off-icons'),
      /0% \{\s*margin: 4px -22px 4px 24px/,
    );
    assert.match(
      keyframes('knob-off-icons'),
      /100% \{\s*margin: 4px -2px 4px 4px/,
    );

    assert.match(
      rule('switch.mswitch.icons.switching:checked > slider'),
      /animation: knob-on-icons 300ms linear/,
    );
    assert.match(
      rule('switch.mswitch.icons.switching:not(:checked) > slider'),
      /animation: knob-off-icons 300ms linear/,
    );
  });

  test('иконки: кольцо 40dp от кноба 24 — 8px, а не 12px', () => {
    // Spread считается от размера кноба: (40 - 24) / 2. С общим правилом
    // hover кольцо было бы 12px и слой вырос бы до 48dp.
    const block = rule('switch.mswitch.icons:not(:checked):hover > slider');

    assert.match(
      block,
      /box-shadow: 0 0 0 8px color-mix\(in srgb, var\(--on_surface\) 8%, transparent\)/,
    );
    assert.match(block, /box-shadow 150ms linear/);
  });

  test('нативные картинки switch скрыты', () => {
    assert.match(rule('switch.mswitch > image'), /opacity: 0/);
  });

  test('фон темы перебит: у слайдера нет своего градиента', () => {
    // Adwaita рисует на slider линейный градиент; иконка и M3-цвет его не заменят.
    assert.match(rule('switch.mswitch > slider'), /background-image: none/);
  });
});
