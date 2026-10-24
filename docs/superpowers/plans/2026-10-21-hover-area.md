# Hover-area у попапов: план реализации (контракт окна)

> **Историческая запись.** Актуальный код — источник истины; документ не поддерживается.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить попапам необязательную hover-зону: полосу на дальней кромке попапа с произвольным контентом, которая при наведении раскрывает попап, при уходе скрывает, а при `hideOnReveal` исчезает полностью, пока попап открыт.

**Architecture:** Lib-слой перестаёт знать про `Gtk.Revealer`: у окна есть контракт `WindowBody` (границы тела, `open`/`animating`, `setOpen`/`toggle`, `subscribe`). `Float` и `Pop` реализуют его; Revealer и hover-зона скрыты внутри. `Pop` — это `Gtk.Box` из главного Revealer'а и hover-зоны; вся hover-логика внутри компонента. Фон/input/магнит/tick-цикл работают только через контракт.

**Tech Stack:** AGS 3 (GJS), GTK 4, TypeScript, gnim JSX, `node --test`, eslint/prettier, tsc, Nix dev shell.

**Spec:** `docs/superpowers/specs/2026-10-21-hover-area-design.md`

## Global Constraints

- AGS 3 / GTK 4 / GJS / TypeScript / gnim. Новых зависимостей нет.
- `../../../src/lib`, `../../../src/lib`, `../../../src/lib` не меняются.
- В `Frame`, `FrameMotion`, `LiquidField`, `FrameInput`, `snap.ts` нет hover/зоны и нет `Gtk.Revealer` в контракте.
- Единственный источник геометрии окна — `WindowBody.bounds(relativeTo)`.
- Магнит видит только `open && !animating`; свёрнутая зона в магнит не попадает.
- Комментарии — по-русски, в стиле окружающего кода.
- Коммиты — только по явной команде пользователя. В шагах плана коммитов нет.
- Тестовый инстанс — `ags`; живой прогон — `MSHELL_DEBUG=1 npm run dev`.
- Проверки после каждой задачи: `npm test`, `npm run lint`, `npx tsc --noEmit`.

## File Structure

- Create: `../../../src/lib` — контракт `WindowBody` + `boundsOf`.
- Create: `../../../src/lib` — чистая раскладка Pop (без GJS).
- Create: `tests/popLayout.test.ts` — unit-тесты раскладки.
- Modify: `../../../src/lib` — реализует `WindowBody`; `revealed`-колбэк и геттер `rect` убираются.
- Modify: `../../../src/lib` — сначала контракт (Task 3), затем Box + hover-зона (Task 4).
- Modify: `../../../src/lib` — `bodies()`, `rects()`, open/close/toggle/closeAll, subscribe; `revealers`/`boundsOf` удаляются.
- Modify: `../../../src/lib` — `bodies` в deps; `snapTarget`/`animating` по контракту.
- Modify: `../../../src/lib` — `FieldStyle.hoverDepth` (логика рендера не меняется).
- Modify: `../../../src/lib` — `hoverDepth` в `DEFAULTS`, `LIMITS`.
- Modify: `tests/config.test.ts` — тест дефолта и лимита `hoverDepth`.
- Modify: `../../../src/lib` — демо: зона с контентом, пустая зона, попап без hover.
- Modify: `style.css` — `.hover-zone`, `.hover-row`.

---

### Task 1: `hoverDepth` в конфиге

**Files:**
- Modify: `../../../src/lib` (`FieldStyle`; логика рендера не меняется)
- Modify: `../../../src/lib`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `FieldStyle.hoverDepth: number`; `DEFAULTS.style.hoverDepth = 6`; `LIMITS.style.hoverDepth = [0, 64]`.

- [ ] **Step 1: Написать падающий тест**

Добавить в `tests/config.test.ts` после теста «анимации: дефолты и лимиты»:

```ts
test('hover: дефолт и лимиты зоны', () => {
  assert.equal(DEFAULTS.style.hoverDepth, 6);
  assert.deepEqual(LIMITS.style.hoverDepth, [0, 64]);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/config.test.ts`
Expected: FAIL — `hoverDepth` отсутствует (`undefined !== 6`).

- [ ] **Step 3: Добавить ключ**

`FieldStyle.hoverDepth` добавляется в `../../../src/lib` после
`revealDuration` (логика рендера не меняется):

```ts
  hoverDepth: number; // толщина hover-зоны попапа, px
```

В `DEFAULTS.style` после `revealDuration`:

```ts
    hoverDepth: 6, // толщина hover-зоны у скрытого попапа
```

В `STYLE_LIMITS` после `revealDuration`:

```ts
  hoverDepth: [0, 64],
```

- [ ] **Step 4: Проверить**

Run: `node --test tests/config.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS.

---

### Task 2: чистая раскладка `popLayout`

**Files:**
- Create: `../../../src/lib`
- Test: `tests/popLayout.test.ts`

**Interfaces:**
- Produces:
  - `type Edge = 'top' | 'bottom' | 'left' | 'right'`
  - `type EdgeAlign = 'start' | 'center' | 'end'`
  - `popLayout(edge, align, style, depth): PopLayout`
  - `PopLayout = { orientation, anchor, order, zone }` (точные поля — в коде ниже).

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/popLayout.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { popLayout } from '../lib/windows/popLayout.ts';

const style = { border: 4, screenRadius: 10 };

test('popLayout: верхний край по центру', () => {
  assert.deepEqual(popLayout('top', 'center', style, 6), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'start',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 4,
      marginBottom: 0,
    },
    order: 'revealer-first',
    zone: { widthRequest: -1, heightRequest: 6 },
  });
});

test('popLayout: нижний край по центру', () => {
  assert.deepEqual(popLayout('bottom', 'center', style, 6), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'end',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 4,
    },
    order: 'zone-first',
    zone: { widthRequest: -1, heightRequest: 6 },
  });
});

test('popLayout: левый и правый край по центру', () => {
  assert.deepEqual(popLayout('left', 'center', style, 6), {
    orientation: 'horizontal',
    anchor: {
      halign: 'start',
      valign: 'center',
      marginStart: 4,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    order: 'revealer-first',
    zone: { widthRequest: 6, heightRequest: -1 },
  });

  assert.deepEqual(popLayout('right', 'center', style, 6), {
    orientation: 'horizontal',
    anchor: {
      halign: 'end',
      valign: 'center',
      marginStart: 0,
      marginEnd: 4,
      marginTop: 0,
      marginBottom: 0,
    },
    order: 'zone-first',
    zone: { widthRequest: 6, heightRequest: -1 },
  });
});

test('popLayout: start/end дают отступ от угла', () => {
  assert.equal(popLayout('top', 'start', style, 6).anchor.marginStart, 14);
  assert.equal(popLayout('top', 'end', style, 6).anchor.marginEnd, 14);
  assert.equal(popLayout('left', 'start', style, 6).anchor.marginTop, 14);
  assert.equal(popLayout('left', 'end', style, 6).anchor.marginBottom, 14);
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test tests/popLayout.test.ts`
Expected: FAIL — модуль `../lib/windows/popLayout.ts` не найден.

- [ ] **Step 3: Написать реализацию**

Создать `../../../src/lib`:

```ts
// Чистая раскладка попапа: прижатие Box к кромке рамки, align вдоль края,
// порядок детей (Revealer у рамки, зона на дальней кромке) и толщина зоны.
// Без GJS — тестируется в node.
export type Edge = 'top' | 'bottom' | 'left' | 'right';
export type EdgeAlign = 'start' | 'center' | 'end';

export interface LayoutStyle {
  border: number;
  screenRadius: number;
}

export interface PopLayout {
  orientation: 'vertical' | 'horizontal';
  anchor: {
    halign: EdgeAlign;
    valign: EdgeAlign;
    marginStart: number;
    marginEnd: number;
    marginTop: number;
    marginBottom: number;
  };
  /** Кто первый в Box: Revealer у кромки рамки или зона. */
  order: 'revealer-first' | 'zone-first';
  zone: {
    widthRequest: number;
    heightRequest: number;
  };
}

/**
 * Вдоль края — align; для start/end добавляется отступ от угла
 * border + screenRadius. Поперёк — прижатие к внутренней кромке рамки.
 */
export const popLayout = (
  edge: Edge,
  align: EdgeAlign,
  style: LayoutStyle,
  depth: number,
): PopLayout => {
  const offset = style.border + style.screenRadius;
  const horizontal = edge === 'top' || edge === 'bottom';

  const margins = {
    marginStart: 0,
    marginEnd: 0,
    marginTop: 0,
    marginBottom: 0,
  };

  if (edge === 'top') {
    margins.marginTop = style.border;
  } else if (edge === 'bottom') {
    margins.marginBottom = style.border;
  } else if (edge === 'left') {
    margins.marginStart = style.border;
  } else {
    margins.marginEnd = style.border;
  }

  if (horizontal) {
    if (align === 'start') {
      margins.marginStart = offset;
    }
    if (align === 'end') {
      margins.marginEnd = offset;
    }
  } else {
    if (align === 'start') {
      margins.marginTop = offset;
    }
    if (align === 'end') {
      margins.marginBottom = offset;
    }
  }

  const anchor = horizontal
    ? {
        halign: align,
        valign: edge === 'top' ? ('start' as const) : ('end' as const),
        ...margins,
      }
    : {
        halign: edge === 'left' ? ('start' as const) : ('end' as const),
        valign: align,
        ...margins,
      };

  const order =
    edge === 'top' || edge === 'left' ? 'revealer-first' : 'zone-first';

  const zone = horizontal
    ? { widthRequest: -1, heightRequest: depth }
    : { widthRequest: depth, heightRequest: -1 };

  return {
    orientation: horizontal ? 'vertical' : 'horizontal',
    anchor,
    order,
    zone,
  };
};
```

- [ ] **Step 4: Проверить**

Run: `node --test tests/popLayout.test.ts`
Expected: PASS (4 теста).

Run: `npx tsc --noEmit`
Expected: без ошибок.

---

### Task 3: контракт `WindowBody` и generic-рефакторинг lib

**Files:**
- Create: `../../../src/lib`
- Modify: `../../../src/lib`
- Modify: `../../../src/lib` (пока без hover-зоны: контракт поверх Revealer'а)
- Modify: `../../../src/lib`
- Modify: `../../../src/lib`

**Interfaces:**
- Produces:
  - `WindowBody = { bounds(relativeTo): Rect | null; open; animating; setOpen(open); toggle(); subscribe(fn) }`
  - `boundsOf(widget, relativeTo): Rect | null`
  - `Frame.bodies(): WindowBody[]`
  - `Pop`/`Float` реализуют `WindowBody`; `Float.rect` и колбэк `revealed` удалены.

- [ ] **Step 1: Создать контракт**

Создать `../../../src/lib`:

```ts
import type { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';

/**
 * Всё, что lib-слою нужно знать об окне. Revealer, hover-зона и внутренности
 * компонента скрыты за этим интерфейсом.
 */
export interface WindowBody {
  /** Видимая часть окна в координатах relativeTo: x, y, w, h. */
  bounds(relativeTo: Gtk.Widget): Rect | null;

  /** Целевое состояние: открыт/закрыт. */
  readonly open: boolean;
  /** Идёт переход: open ещё не совпал с фактическим. */
  readonly animating: boolean;

  setOpen(open: boolean): void;
  toggle(): void;

  /** Изменение состояния/раскладки: lib делает poke. */
  subscribe(fn: () => void): () => void;
}

/** Границы тела окна; null, если оно ещё не разложено. */
export const boundsOf = (
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null => {
  const [ok, bounds] = widget.compute_bounds(relativeTo);
  if (!ok || bounds.get_width() < 1 || bounds.get_height() < 1) {
    return null;
  }
  return {
    x: bounds.get_x(),
    y: bounds.get_y(),
    w: bounds.get_width(),
    h: bounds.get_height(),
  };
};
```

- [ ] **Step 2: `Float` реализует контракт**

В `../../../src/lib`:

1. Импорт контракта:

```ts
import { boundsOf, type WindowBody } from './body';
```

2. Класс:

```ts
export class Float implements WindowBody {
```

3. Конструктор больше не принимает `revealed`; строка подключения Revealer'а
   удаляется:

```ts
  constructor(
    readonly spec: FloatSpec,
    onClose: () => void,
    private duration: () => number,
  ) {
```

Удалить:

```ts
    revealer.connect('notify::child-revealed', revealed);
```

4. Удалить геттер `get rect()` целиком (его заменит `bounds`).

5. Добавить методы контракта после конструктора:

```ts
  get open(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    return this.revealer.reveal_child !== this.revealer.child_revealed;
  }

  setOpen(open: boolean) {
    this.revealer.reveal_child = open;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  subscribe(fn: () => void): () => void {
    const ids = [
      this.revealer.connect('notify::reveal-child', fn),
      this.revealer.connect('notify::child-revealed', fn),
    ];
    return () => {
      for (const id of ids) {
        this.revealer.disconnect(id);
      }
    };
  }

  bounds(relativeTo: Gtk.Widget): Rect | null {
    return boundsOf(this.revealer, relativeTo);
  }
```

- [ ] **Step 3: `Pop` реализует контракт (пока без зоны)**

В `../../../src/lib`:

1. Импорт:

```ts
import { boundsOf, type WindowBody } from './body';
```

2. Класс:

```ts
export class Pop implements WindowBody {
```

3. Конструктор больше не принимает `revealed`; подключение удаляется:

```ts
  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
      hoverDepth: number;
    },
  ) {
```

Удалить:

```ts
    revealer.connect('notify::child-revealed', revealed);
```

4. Добавить тело и методы контракта:

```ts
  /** Пока тело попапа — сам Revealer; в Task 4 станет Box'ом. */
  get widget(): Gtk.Widget {
    return this.revealer;
  }

  get open(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    return this.revealer.reveal_child !== this.revealer.child_revealed;
  }

  setOpen(open: boolean) {
    this.revealer.reveal_child = open;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  subscribe(fn: () => void): () => void {
    const ids = [
      this.revealer.connect('notify::reveal-child', fn),
      this.revealer.connect('notify::child-revealed', fn),
    ];
    return () => {
      for (const id of ids) {
        this.revealer.disconnect(id);
      }
    };
  }

  bounds(relativeTo: Gtk.Widget): Rect | null {
    return boundsOf(this.revealer, relativeTo);
  }
```

`apply()` не меняется.

- [ ] **Step 4: `Frame` работает только через контракт**

В `../../../src/lib`:

1. Импорт:

```ts
import type { WindowBody } from '../windows/body';
```

2. Удалить методы `boundsOf` и `revealers`.

3. Добавить `bodies()` и переписать `rects()`:

```ts
  /** Все тела поля: попапы и флоаты. */
  private bodies(): WindowBody[] {
    return [...this.pops.values(), ...this.floats.values()];
  }

  /** Тела поля в координатах поля. Больше никаких ключей: жидкость — функция раскладки. */
  private rects(): Rect[] {
    return this.bodies()
      .map((body) => body.bounds(this.field))
      .filter((rect): rect is Rect => rect !== null);
  }
```

4. Конструктор `FrameMotion`:

```ts
    this.motion = new FrameMotion({
      field: this.field,
      fixed: this.fixed,
      style,
      floats: this.floats,
      bodies: () => this.bodies(),
    });
```

5. `open/close/toggle/closeAll`:

```ts
  open(id: string) {
    const pop = this.pops.get(id);
    if (pop) {
      for (const [otherId, other] of this.pops) {
        if (otherId !== id) {
          other.setOpen(false);
        }
      }
      pop.setOpen(true);
    } else {
      this.floats.get(id)?.setOpen(true);
    }
    this.motion.tick();
  }

  close(id: string) {
    (this.pops.get(id) ?? this.floats.get(id))?.setOpen(false);
    this.motion.tick();
  }

  toggle(id: string) {
    (this.pops.get(id) ?? this.floats.get(id))?.toggle();
    this.motion.tick();
  }

  closeAll() {
    for (const body of this.bodies()) {
      body.setOpen(false);
    }
  }
```

6. `debug.reveal`:

```ts
    reveal: (float: Float) => {
      float.setOpen(true);
    },
```

7. `addPop` и `addFloat` — подписка вместо колбэка `revealed`:

```ts
  private addPop(spec: PopSpec): Gtk.Widget {
    const pop = new Pop(
      spec,
      () => ({
        border: this.style.border(),
        screenRadius: this.style.screenRadius(),
        revealDuration: this.style.revealDuration(),
        hoverDepth: this.style.hoverDepth(),
      }),
    );
    pop.subscribe(() => this.motion.poke());
    this.pops.set(spec.id, pop);
    return pop.widget;
  }

  private addFloat(spec: FloatSpec) {
    const float = new Float(
      spec,
      () => this.close(spec.id),
      () => this.style.revealDuration(),
    );
    float.subscribe(() => this.motion.poke());
    this.fixed.put(float.revealer, float.x, float.y);
    this.floats.set(spec.id, float);
  }
```

- [ ] **Step 5: `FrameMotion` по контракту**

В `../../../src/lib`:

1. Импорт:

```ts
import type { WindowBody } from '../windows/body';
```

2. `MotionDeps`:

```ts
export interface MotionDeps {
  field: Gtk.Widget;
  fixed: Gtk.Fixed;
  style: Reactive<FieldStyle>;
  floats: Map<string, Float>;
  bodies: () => WindowBody[];
}
```

3. `snapTarget`:

```ts
  private snapTarget(float: Float): { x: number; y: number } | null {
    const { border, screenRadius, waistReach, windowRadius } = snapshot(
      this.deps.style,
    );
    const self = float.bounds(this.deps.field);
    if (!self) {
      return null;
    }

    // Соседи — все видимые тела поля, не только Float: выехавший Pop тоже
    // должен притягивать окно и слипаться с ним.
    const others = this.deps
      .bodies()
      .filter((body) => body !== float && body.open && !body.animating)
      .map((body) => body.bounds(this.deps.field))
      .filter((rect): rect is Rect => rect !== null)
      .map((rect) => ({ ...rect, cornerRadius: windowRadius }));

    return snapTo(
      {
        frame: {
          w: this.deps.field.get_width(),
          h: this.deps.field.get_height(),
          border,
          screenRadius,
        },
        reach: waistReach,
      },
      { ...self, cornerRadius: windowRadius },
      others,
    );
  }
```

4. `animating`:

```ts
  private animating() {
    return this.deps.bodies().some((body) => body.animating);
  }
```

Остальное (`installDrag`, `raise`, `place`, `moveTo`, `snapFloat`, `tick`)
не меняется: drag — Float-специфика, он по-прежнему работает с `float.revealer`.

- [ ] **Step 6: Проверить типы, линт и тесты**

Run: `npx tsc --noEmit`
Expected: без ошибок.

Run: `npm run lint`
Expected: без ошибок.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Живой smoke регрессии**

Run: `MSHELL_DEBUG=1 npm run dev`

В другом терминале:

```bash
ags request toggle player
ags request toggle settings
ags request toggle launcher
ags request closeall
ags request rects
ags request frames
```

Expected:
- попапы открываются/закрываются как раньше, на своих краях;
- флоаты таскаются и примагничиваются;
- `rects` для раскрытых попапов и флоатов совпадает с прежним поведением;
- hover-зон пока нет (демо ещё без `hover`).

---

### Task 4: hover-зона внутри `Pop`, демо и приёмка

**Files:**
- Modify: `../../../src/lib` (Box + Revealer + зона)
- Modify: `../../../src/lib` (только `addPop`: hover-колбэки)
- Modify: `../../../src/lib`
- Modify: `style.css`

**Interfaces:**
- Consumes: `WindowBody`, `popLayout`, `FieldStyle.hoverDepth`.
- Produces:
  - `HoverSpec = { depth?: number; content?: Content; hideOnReveal?: boolean }`
  - `PopSpec.hover?: HoverSpec`
  - `HoverCallbacks = { enter(): void; leave(): void }`
  - `Pop` constructor: `(spec, style, hover: HoverCallbacks | null)`
  - `Pop.widget: Gtk.Box`

- [ ] **Step 1: Переписать `../../../src/lib`**

```ts
import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { boundsOf, type WindowBody } from './body';
import { type Edge, type EdgeAlign, popLayout } from './popLayout';
import { type Content, padded } from './ui';

export type { Edge, EdgeAlign } from './popLayout';

export interface HoverSpec {
  depth?: number; // толщина зоны, px; по умолчанию style.hoverDepth
  content?: Content; // компонент внутри зоны
  hideOnReveal?: boolean; // скрыть зону, пока попап раскрыт
}

/** Окно, выезжающее из края рамки (открывается/закрывается). */
export interface PopSpec {
  id: string;
  edge: Edge;
  align?: EdgeAlign; // положение вдоль края
  content: Content; // вызывается по разу на монитор; фон НЕ задавать
  hover?: HoverSpec; // нет — попап без hover-логики
}

export interface HoverCallbacks {
  enter(): void;
  leave(): void;
}

const SLIDE = {
  top: Gtk.RevealerTransitionType.SLIDE_DOWN,
  bottom: Gtk.RevealerTransitionType.SLIDE_UP,
  left: Gtk.RevealerTransitionType.SLIDE_RIGHT,
  right: Gtk.RevealerTransitionType.SLIDE_LEFT,
};

const ALIGN = {
  start: Gtk.Align.START,
  center: Gtk.Align.CENTER,
  end: Gtk.Align.END,
};

const ORIENTATION = {
  vertical: Gtk.Orientation.VERTICAL,
  horizontal: Gtk.Orientation.HORIZONTAL,
};

/**
 * Выдвижной слот рамки: попап (Revealer) у внутренней кромки и hover-зона
 * на дальней кромке. Всё — один Box; его границы идут в Frame.bodies(),
 * поэтому фон, input и hover считаются по одной геометрии.
 */
export class Pop implements WindowBody {
  readonly widget: Gtk.Box;
  readonly revealer: Gtk.Revealer;
  private readonly zone: Gtk.Box | null;

  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
      hoverDepth: number;
    },
    hover: HoverCallbacks | null,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: SLIDE[spec.edge],
      revealChild: false,
    });
    revealer.set_child(padded(spec.content()));

    const widget = new Gtk.Box();
    let zone: Gtk.Box | null = null;

    if (spec.hover) {
      zone = new Gtk.Box();
      zone.add_css_class('hover-zone');
      if (spec.hover.content) {
        zone.append(spec.hover.content() as Gtk.Widget);
      }
    }

    // Revealer — у кромки рамки, зона — на дальней кромке.
    if (this.layout().order === 'revealer-first') {
      widget.append(revealer);
      if (zone) {
        widget.append(zone);
      }
    } else {
      if (zone) {
        widget.append(zone);
      }
      widget.append(revealer);
    }

    if (zone && hover) {
      const motion = new Gtk.EventControllerMotion();
      motion.connect('enter', () => hover.enter());
      motion.connect('leave', () => hover.leave());
      widget.add_controller(motion);
    }

    if (zone) {
      // hideOnReveal: во время открытия зона ещё видна (Box не должен
      // схлопнуться под курсором); после раскрытия — скрывается целиком.
      const sync = () => {
        if (!spec.hover!.hideOnReveal || !revealer.reveal_child) {
          zone!.visible = true;
          return;
        }
        zone!.visible = !revealer.child_revealed;
      };
      revealer.connect('notify::reveal-child', sync);
      revealer.connect('notify::child-revealed', sync);
      sync();
    }

    this.widget = widget;
    this.revealer = revealer;
    this.zone = zone;
    this.apply();
  }

  get open(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    return this.revealer.reveal_child !== this.revealer.child_revealed;
  }

  setOpen(open: boolean) {
    this.revealer.reveal_child = open;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  subscribe(fn: () => void): () => void {
    const ids = [
      this.revealer.connect('notify::reveal-child', fn),
      this.revealer.connect('notify::child-revealed', fn),
    ];
    return () => {
      for (const id of ids) {
        this.revealer.disconnect(id);
      }
    };
  }

  bounds(relativeTo: Gtk.Widget): Rect | null {
    return boundsOf(this.widget, relativeTo);
  }

  /** Раскладка по текущему конфигу. */
  private layout() {
    const { border, screenRadius, hoverDepth } = this.style();
    const depth = this.spec.hover
      ? (this.spec.hover.depth ?? hoverDepth)
      : 0;
    return popLayout(
      this.spec.edge,
      this.spec.align ?? 'center',
      { border, screenRadius },
      depth,
    );
  }

  /** Переставить слот, зону и обновить длительности по текущему конфигу. */
  apply() {
    const layout = this.layout();
    this.revealer.transitionDuration = this.style().revealDuration;

    this.widget.orientation = ORIENTATION[layout.orientation];
    this.widget.halign = ALIGN[layout.anchor.halign];
    this.widget.valign = ALIGN[layout.anchor.valign];
    this.widget.marginStart = layout.anchor.marginStart;
    this.widget.marginEnd = layout.anchor.marginEnd;
    this.widget.marginTop = layout.anchor.marginTop;
    this.widget.marginBottom = layout.anchor.marginBottom;

    if (this.zone) {
      this.zone.set_size_request(
        layout.zone.widthRequest,
        layout.zone.heightRequest,
      );
    }
  }
}
```

- [ ] **Step 2: `Frame.addPop` передаёт hover-колбэки**

В `../../../src/lib` в `addPop` добавить третий аргумент:

```ts
    const pop = new Pop(
      spec,
      () => ({
        border: this.style.border(),
        screenRadius: this.style.screenRadius(),
        revealDuration: this.style.revealDuration(),
        hoverDepth: this.style.hoverDepth(),
      }),
      spec.hover
        ? {
            enter: () => this.open(spec.id),
            leave: () => this.close(spec.id),
          }
        : null,
    );
```

Остальное в `addPop` не меняется: `pop.subscribe(...)`, `this.pops.set`,
`return pop.widget`.

- [ ] **Step 3: Стили**

В `style.css` после `.title`:

```css
/* Hover-зона попапа: фон рисует LiquidField, контент — обычные виджеты. */
.hover-zone { color: #d3c6aa; }
.hover-row { padding: 4px 12px; }
```

- [ ] **Step 4: Демо**

В `../../../src/lib` добавить контент зоны и включить hover:

```tsx
function PlayerHover() {
  return (
    <box class="hover-row" spacing={8}>
      <image iconName="media-playback-start-symbolic" />
      <label label="Player" />
    </box>
  );
}
```

Заменить три вызова `addPop`:

```tsx
// Выезжают из краёв: ags request toggle player
addPop({
  id: 'player',
  edge: 'top',
  hover: { content: PlayerHover, hideOnReveal: true },
  content: Player,
});
addPop({
  id: 'settings',
  edge: 'right',
  hover: { depth: 5 },
  content: Settings,
});
addPop({ id: 'launcher', edge: 'bottom', content: Launcher });
```

- [ ] **Step 5: Живой прогон hover-зоны**

Run: `MSHELL_DEBUG=1 npm run dev` (dev.sh перезапускается сам при правках).

Проверить по порядку:

1. `ags request rects` при закрытых попапах: тело игрока `W × высота
   hover-row` у верхней кромки и тело настроек `5 × H` у правой. Это зоны;
   фон и input — по ним же.
2. Навести мышь на верхнюю зону → player выезжает, остальные закрываются.
   Курсор внутрь попапа — не закрывается. Курсор наружу — закрывается.
3. При открытом player (`hideOnReveal: true`) зоны не видно; попап выглядит
   как до фичи: контент у рамки, без добавленного паддинга; `rects` при
   открытом player — `W×H`, без полосы зоны.
4. Навести на правую 5px зону → settings выезжает. Зона (пустая) уезжает на
   дальний край и лежит поверх паддинга; длина попапа не изменилась.
5. Launcher: `ags request toggle launcher` открывает/закрывает без hover.
6. Временно добавить `hover: {}` к launcher, дождаться перезапуска, проверить
   нижний край; вернуть строку.
7. Временно поменять `settings.edge` на `'left'`, проверить левый край;
   вернуть `'right'`.
8. `ags request tune hoverDepth 40` при закрытом player — зона растёт (тело и
   input едут за ней); вернуть `ags request tune hoverDepth 6`.
9. Временно завернуть часть контента Player в собственный `Gtk.Revealer`
   (например, с кнопкой-переключателем) и пощёлкать: при изменении размера
   фон и input должны ехать за внешними границами без правок lib; убрать.
10. Визуально: зона слита с рамкой, без шва; goo и чёткий слой как у
    остальных тел.

- [ ] **Step 6: Финальные проверки**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: без ошибок.

Run: `npx tsc --noEmit`
Expected: без ошибок.

---

## Self-Review

- Покрытие спеки: R1/R2 — Task 3 (`WindowBody`, `bodies()`); R3 — Task 4 (вся
  hover-логика в `Pop`); R4/R5 — Task 4 (Box + зона, рендер не тронут);
  R6 — Task 4 (контроллер на `Pop.widget`); R7 — Task 4 (`content`,
  `hideOnReveal`); R8 — Tasks 3/4 (`hover` отсутствует → обычный Revealer);
  R9 — Task 4 (живой прогон с вложенным Revealer'ом); R10 — Task 1;
  R11 — Tasks 1/2 (unit) + Task 4 (живой прогон).
- Плейсхолдеров нет: все шаги с кодом или точными командами.
- Имена и типы согласованы: `WindowBody`, `bounds`, `open`, `animating`,
  `setOpen`, `toggle`, `subscribe`, `Pop.widget`, `popLayout`.
- Коммиты намеренно отсутствуют: правило проекта — только по команде
  пользователя.
