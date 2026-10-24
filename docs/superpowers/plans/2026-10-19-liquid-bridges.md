# Единый мостик жидкости — план реализации

> **Историческая запись.** Актуальный код — источник истины; документ не поддерживается.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить набор спецкейсов жидкости (`../../../src/lib`) одной геометрией «ближайшие точки + капсула», доказать отсутствие скачков рендер-тестами и переключить на неё `LiquidField`.

**Architecture:** Тела и кромка рамки описываются как скруглённые прямоугольники. Для каждого тела с каждой из 8 фигур кромки рамки и с каждым другим телом находятся ближайшие точки и зазор; по зазору строится капсула (повёрнутый скруглённый прямоугольник) шириной из закона `base·√(1−gap/reach)`. Всё — чистая функция раскладки, состояние между кадрами отсутствует. Blur + порог остаются на GPU; CPU-модель того же пайплайна используется только в тестах и для GIF.

**Tech Stack:** TypeScript (Node 24, type stripping, `node:test`), AGS 3 / GTK 4.22 / Gsk (`Gtk.Snapshot.transform`, `Gsk.Transform`), ffmpeg для GIF.

**Spec:** `docs/superpowers/specs/2026-10-19-liquid-bridges-design.md`

## Global Constraints

- R1–R10 спеки действуют для каждой задачи. Ключевые: форма — чистая функция раскладки (R6); рендер только на GPU (R7); `radius` рядом с `windowRadius` быть не должно — переименовывается в `screenRadius` (R10).
- `screenRadius` / `border` / `windowRadius` / `meltRadius` / `waistReach` / `sharp` / `blurScale` — имена настроек не меняются, кроме переименования `radius` → `screenRadius`.
- Каждый шаг: тест сначала (RED по правильной причине), затем минимальная реализация (GREEN), затем `npx eslint --fix <файлы>` и `npx tsc --noEmit --pretty false`. Тесты не входят в tsc (`exclude: ["tests"]`), их правит Node.
- Коммиты — **только по команде пользователя**. Шаги «commit» из шаблона заменены на «показать `git status --short`»; ничего не коммитить.
- Комментарии в коде — по-русски, объясняют математику для backend-разработчика.
- `.envrc` содержит ключ — не читать, не выводить, не коммитить. Чужой инстанс `mshell` не трогать; тестовый перезапускать через `ags quit -i ags`. В `~/.config/ags` не заглядывать.
- Живой стенд: поле 1258×838 логических px, eDP-1 2520×1680 при scale 2. Окна: notes 288×168, mixer 308×158.
- Ноль новых зависимостей: ffmpeg, grim, node уже есть.
- `Gsk.Transform` собран как `Gsk.Transform.new().translate(point).rotate(degrees)`; угол — градусы по часовой, матрица `T·R` (проверено: для 30° `to_matrix` даёт `[0.866, 0.5, −0.5, 0.866, 10, 20]`). Поворот применяется к содержимому в локальных координатах.

---

## Файлы

- Создать: `../../../src/lib` — типы тел/рамки, ближайшие точки, зазоры, стык.
- Создать: `../../../src/lib` — капсулы, закон ширины, спецификация из настроек.
- Создать: `tests/geometry.test.ts`, `tests/bridges.test.ts`.
- Создать: `tests/support/raster.ts` — CPU-модель слоя жидкости.
- Создать: `tests/support/scenarios.ts` — сценарии (диагональ, ниши 4 стен, угол, снап).
- Создать: `tests/render.test.ts` — рендер-инварианты.
- Создать: `tests/visual/gifs.ts` — генерация GIF.
- Изменить: `../../../src/lib` — рисование мостиков, удаление якорей/заплаток.
- Изменить: `../../../src/lib` — убрать `id` и `settling`; переименовать `radius`.
- Изменить: `../../../src/lib`, `../../../src/lib`, `tests/snap.test.ts`, `app.tsx` — переименование `radius` → `screenRadius`.
- Удалить: `../../../src/lib`, `tests/waist.test.ts`.

---

### Task 1: Контакт двух тел

**Files:**
- Create: `../../../src/lib`
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Produces:
  - `interface Box { x: number; y: number; w: number; h: number }`
  - `interface Body extends Box { cornerRadius: number }`
  - `interface Point { x: number; y: number }`
  - `interface FrameSpec { w: number; h: number; border: number; screenRadius: number }`
  - `interface Contact { a: Point; b: Point; gap: number; seam: number; nx: number; ny: number }` — `a` на первом теле, `b` на втором/кромке; `gap` между кромками (<0 — перелёт); `seam` — длина общего участка рёбер (0 для стыка точка-в-точку); `(nx,ny)` — единичная нормаль от `a` к `b`.
  - `contactBetween(first: Body, second: Body): Contact | null` (null — сердцевины перекрылись).

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/geometry.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Body,
  contactBetween,
} from '../lib/liquid/geometry.ts';

const body = (
  x: number,
  y: number,
  w = 100,
  h = 100,
  cornerRadius = 12,
): Body => ({
  x,
  y,
  w,
  h,
  cornerRadius,
});
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('тела рядом: точки на кромках, между ними чистый зазор', () => {
  const c = contactBetween(body(100, 100), body(240, 100));
  assert.ok(c);
  assert.ok(near(c.a.x, 200) && near(c.a.y, 150), `a = ${c.a.x},${c.a.y}`);
  assert.ok(near(c.b.x, 240) && near(c.b.y, 150), `b = ${c.b.x},${c.b.y}`);
  assert.ok(near(c.gap, 40));
  assert.ok(near(c.seam, 76)); // прямая часть стороны: 100 − 2·12
  assert.ok(near(c.nx, 1) && near(c.ny, 0));
});

test('диагональ: зазор между круглыми углами, стыка нет', () => {
  const c = contactBetween(body(100, 100), body(240, 240));
  assert.ok(c);
  assert.ok(near(c.gap, Math.hypot(64, 64) - 24));
  assert.ok(near(c.a.x, 188 + 12 / Math.SQRT2));
  assert.ok(near(c.a.y, 188 + 12 / Math.SQRT2));
  assert.ok(near(c.b.x, 252 - 12 / Math.SQRT2));
  assert.ok(near(c.b.y, 252 - 12 / Math.SQRT2));
  assert.equal(c.seam, 0);
});

test('диагональ упирается в ребро без скачка: точки, зазор и стык непрерывны', () => {
  // B поднимается навстречу A; на t = 64 сердцевины касаются по y, и стык
  // переключается с «угол к углу» (seam 0) на «ребро к ребру» (seam = сторона).
  const at = (t: number) => contactBetween(body(100, 100), body(240, 240 - t));
  let prev = at(0);
  assert.ok(prev);
  for (let i = 1; i <= 280; i++) {
    const t = i * 0.5;
    const c = at(t);
    assert.ok(c, `t = ${t}: контакта нет`);
    assert.ok(Math.hypot(c.a.x - prev.a.x, c.a.y - prev.a.y) < 0.6, `t = ${t}: a прыгнула`);
    assert.ok(Math.hypot(c.b.x - prev.b.x, c.b.y - prev.b.y) < 0.6, `t = ${t}: b прыгнула`);
    assert.ok(Math.abs(c.gap - prev.gap) < 0.6, `t = ${t}: зазор прыгнул`);
    prev = c;
  }
  // Тела встали вровень: стык — прямая часть стороны, 100 − 2·12 = 76.
  assert.ok(prev.seam > 75, `после переключения стык — вся прямая сторона: ${prev.seam}`);
});

test('контакт не зависит от порядка тел', () => {
  const first = body(100, 100);
  const second = body(240, 240);
  const ab = contactBetween(first, second);
  const ba = contactBetween(second, first);
  assert.ok(ab && ba);
  assert.ok(near(ba.a.x, ab.b.x) && near(ba.a.y, ab.b.y));
  assert.ok(near(ba.b.x, ab.a.x) && near(ba.b.y, ab.a.y));
  assert.ok(near(ba.gap, ab.gap));
});
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `node --test tests/geometry.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` для `../../../src/lib`.

- [ ] **Step 3: Реализовать минимально**

Создать `../../../src/lib`:

```ts
// Геометрия жидкости: тела — скруглённые прямоугольники, кромка рамки — прямые
// участки стен и дуги внутренних углов. Здесь только поиск ближайших точек,
// глобальных «якорей» и состояния нет.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body extends Box {
  /** Радиус скругления углов тела (для окон — `windowRadius`). */
  cornerRadius: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Точки контакта: a — на первом теле, b — на втором; nx, ny — нормаль a→b. */
export interface Contact {
  a: Point;
  b: Point;
  gap: number;
  /** Длина общего участка прямых сторон (0 — стык уголками/дугой). */
  seam: number;
  nx: number;
  ny: number;
}

/** Внутренняя кромка рамки: прямоугольник с отступом border и радиусом дуг. */
export interface FrameSpec {
  w: number;
  h: number;
  border: number;
  screenRadius: number;
}

/** Радиус, который реально влезает в тело (углы не больше половины стороны). */
export const clampRadius = (body: Body) =>
  Math.max(0, Math.min(body.cornerRadius, body.w / 2, body.h / 2));

/**
 * Сердцевина: скруглённый прямоугольник = прямоугольник ⊕ круг радиуса R
 * (сумма Минковского). Поэтому все расстояния считаем между сердцевинами
 * и вычитаем R1 + R2.
 */
export const coreOf = (body: Body): Box => {
  const r = clampRadius(body);
  return { x: body.x + r, y: body.y + r, w: body.w - 2 * r, h: body.h - 2 * r };
};

/**
 * Зазор между двумя отрезками одной оси и точки, между которыми он меряется.
 *
 * Если отрезки не пересекаются — ближайшие концы. Если пересекаются — берём
 * СЕРЕДИНУ общего участка: она рождается в точке касания и дальше едет
 * непрерывно. Иначе на переходе «диагональ → ребро» точка прыгала бы с угла
 * на середину стороны.
 */
const axisGap = (a0: number, a1: number, b0: number, b1: number) => {
  if (b0 > a1) return { from: a1, to: b0, gap: b0 - a1 };
  if (a0 > b1) return { from: a0, to: b1, gap: a0 - b1 };
  const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  return { from: mid, to: mid, gap: 0 };
};

/** Ближайшие точки двух тел; null — сердцевины перекрылись (тела уже слиты). */
export const contactBetween = (
  first: Body,
  second: Body,
): Contact | null => {
  const r1 = clampRadius(first);
  const r2 = clampRadius(second);
  const c1 = coreOf(first);
  const c2 = coreOf(second);
  const x = axisGap(c1.x, c1.x + c1.w, c2.x, c2.x + c2.w);
  const y = axisGap(c1.y, c1.y + c1.h, c2.y, c2.y + c2.h);
  const dx = x.to - x.from;
  const dy = y.to - y.from;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  // Стык — пересечение ПРЯМЫХ участков сторон (то есть сердцевин): скругления
  // углов в стыкующееся ребро не входят. В момент «диагональ → ребро» он
  // рождается из нуля и дальше растёт непрерывно — без скачка ширины капли.
  const seam =
    x.gap > 0
      ? Math.max(0, Math.min(c1.y + c1.h, c2.y + c2.h) - Math.max(c1.y, c2.y))
      : y.gap > 0
        ? Math.max(0, Math.min(c1.x + c1.w, c2.x + c2.w) - Math.max(c1.x, c2.x))
        : 0;
  return {
    a: { x: x.from + nx * r1, y: y.from + ny * r1 },
    b: { x: x.to - nx * r2, y: y.to - ny * r2 },
    gap: dist - r1 - r2,
    seam,
    nx,
    ny,
  };
};
```

- [ ] **Step 4: Убедиться, что тест зелёный**

Run: `node --test tests/geometry.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Линт и типы**

Run: `npx eslint --fix lib/liquid/geometry.ts tests/geometry.test.ts && npx tsc --noEmit --pretty false`
Expected: без новых ошибок (ошибки из `/nix/store` не считаются).

- [ ] **Step 6: Показать статус (без коммита)**

Run: `git status --short`
Expected: новые файлы `../../../src/lib`, `tests/geometry.test.ts`.

---

### Task 2: Контакт тела с кромкой рамки

**Files:**
- Modify: `../../../src/lib`
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Consumes: `Body`, `FrameSpec`, `Contact`, `coreOf`, `clampRadius`, `axisGap` из Task 1.
- Produces: `contactsWithFrame(body: Body, frame: FrameSpec): Contact[]` — всегда 8 контактов в порядке `[верх, низ, лево, право, дуга ЛВ, дуга ПВ, дуга ЛН, дуга ПН]`. Фильтрации по досягаемости здесь нет — это делает `bridges`.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `tests/geometry.test.ts` (импорт пополнить `FrameSpec`, `contactsWithFrame`):

```ts
const frame: FrameSpec = { w: 1260, h: 840, border: 4, screenRadius: 10 };

test('верхняя стена: перпендикуляр и точка на внутренней кромке', () => {
  const [top] = contactsWithFrame(body(100, 10, 100, 50), frame);
  assert.ok(near(top.b.x, 150) && near(top.b.y, 4));
  assert.ok(near(top.a.y, 10));
  assert.ok(near(top.gap, 6));
  assert.ok(near(top.seam, 76)); // прямая часть стороны: 100 − 2·12
});

test('левая стена: зеркально верхней', () => {
  const left = contactsWithFrame(body(10, 100, 50, 100), frame)[2];
  assert.ok(near(left.b.x, 4) && near(left.b.y, 150));
  assert.ok(near(left.a.x, 10));
  assert.ok(near(left.gap, 6));
  assert.ok(near(left.seam, 76));
});

test('дуга угла: точка на окружности внутреннего радиуса рамки', () => {
  // Центр дуги ЛВ — (border + screenRadius, border + screenRadius) = (14, 14),
  // радиус — screenRadius = 10: так рамку рисует append_border. Окно стоит
  // в комнате, к юго-востоку от центра, поэтому точка контакта — середина
  // дуги (6.93, 6.93): она на кромке и не прыгает при движении окна.
  const arc = contactsWithFrame(body(20, 20, 100, 50), frame)[4];
  assert.ok(near(Math.hypot(arc.b.x - 14, arc.b.y - 14), 10), 'b на дуге радиуса 10');
  assert.ok(
    near(arc.b.x, 14 - 10 / Math.SQRT2) && near(arc.b.y, 14 - 10 / Math.SQRT2),
  );
  assert.ok(
    near(arc.gap, Math.hypot(18 + 10 / Math.SQRT2, 18 + 10 / Math.SQRT2) - 12),
  );
  assert.equal(arc.seam, 0);
});

test('переход стена → дуга непрерывен', () => {
  // Окно едет по диагонали к левому верхнему углу: контакт с верхней стеной,
  // с левой стеной и с дугой меняется без прыжков (фиксированные индексы).
  const at = (d: number) => contactsWithFrame(body(d, d, 100, 50), frame);
  let prev = at(160);
  for (let i = 1; i <= 130; i++) {
    const d = 160 - i;
    const cur = at(d);
    for (const index of [0, 2, 4]) {
      assert.ok(
        Math.hypot(cur[index].b.x - prev[index].b.x, cur[index].b.y - prev[index].b.y) < 1.6,
        `d = ${d}, контакт ${index}: b прыгнула`,
      );
      assert.ok(Math.abs(cur[index].gap - prev[index].gap) < 1.6, `d = ${d}, контакт ${index}: зазор прыгнул`);
    }
    prev = cur;
  }
});
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `node --test tests/geometry.test.ts`
Expected: FAIL — `contactsWithFrame is not a function` / отсутствует экспорт.

- [ ] **Step 3: Реализовать**

Дописать в `../../../src/lib`:

```ts
/**
 * Контакты тела с кромкой рамки: 4 прямых участка и 4 дуги внутренних углов.
 *
 * Каждая фигура считается независимо, поэтому на 45° обе стены равноудалены
 * и обе получают мостик — выбора «какая ближе» нет, скачка нет по построению.
 * Порядок результата: [верх, низ, лево, право, ЛВ, ПВ, ЛН, ПН].
 */
export const contactsWithFrame = (
  body: Body,
  frame: FrameSpec,
): Contact[] => {
  const rw = clampRadius(body);
  const core = coreOf(body);
  const left = frame.border;
  const top = frame.border;
  const right = frame.w - frame.border;
  const bottom = frame.h - frame.border;
  // Радиус дуги внутреннего угла и её центр. append_border рисует рамку так,
  // что заданный screenRadius — это радиус ВНУТРЕННЕГО угла, а центр дуги
  // лежит на border внутрь от края экрана; прямые полосы жидкости начинаются
  // там, где кончается дуга: border + screenRadius.
  const arc = frame.screenRadius;

  /** Контакт по точке q на кромке рамки: тело ищем со своей стороны. */
  const fromEdge = (q: Point, seam: number): Contact => {
    // Ближайшая к q точка сердцевины тела — «квадратная» проекция.
    const qx = Math.max(core.x, Math.min(q.x, core.x + core.w));
    const qy = Math.max(core.y, Math.min(q.y, core.y + core.h));
    const dx = q.x - qx;
    const dy = q.y - qy;
    const dist = Math.hypot(dx, dy);
    // При касании (dist = 0) нормаль не определена; берём любую — длина
    // капсулы от этого не зависит, торец всё равно внутри тела.
    const nx = dist === 0 ? 1 : dx / dist;
    const ny = dist === 0 ? 0 : dy / dist;
    return {
      a: { x: qx + nx * rw, y: qy + ny * rw },
      b: q,
      gap: dist - rw,
      seam,
      nx,
      ny,
    };
  };

  /** Прямая стена: вдоль — середина стыка, поперёк — перпендикуляр. */
  const side = (
    horizontal: boolean,
    fixed: number,
    from: number,
    to: number,
  ): Contact => {
    const span = horizontal
      ? axisGap(core.x, core.x + core.w, from, to)
      : axisGap(core.y, core.y + core.h, from, to);
    // Стык — прямая часть стороны окна (между скруглениями), попавшая на
    // прямой участок стены. Тот же смысл, что у contactBetween: seam из нуля.
    const spanFrom = horizontal ? core.x : core.y;
    const spanTo = horizontal ? core.x + core.w : core.y + core.h;
    const seam = Math.max(0, Math.min(to, spanTo) - Math.max(from, spanFrom));
    const q = horizontal
      ? { x: span.to, y: fixed }
      : { x: fixed, y: span.to };
    return fromEdge(q, seam);
  };

  const sides = [
    side(true, top, left + arc, right - arc),
    side(true, bottom, left + arc, right - arc),
    side(false, left, top + arc, bottom - arc),
    side(false, right, top + arc, bottom - arc),
  ];

  // Дуги: центр угла и знак сектора, смотрящего В УГОЛ экрана (от комнаты).
  // Дуга — вогнутая граница материала рамки; тело стоит с другой стороны,
  // поэтому точка дуги ищется со стороны угла.
  const corners = [
    { cx: left + arc, cy: top + arc, sx: -1, sy: -1 }, // ЛВ
    { cx: right - arc, cy: top + arc, sx: 1, sy: -1 }, // ПВ
    { cx: left + arc, cy: bottom - arc, sx: -1, sy: 1 }, // ЛН
    { cx: right - arc, cy: bottom - arc, sx: 1, sy: 1 }, // ПН
  ];
  const arcs = corners.map((c) => {
    // Направление от центра дуги к ближайшей точке сердцевины, прижатое к
    // сектору дуги. Тело в комнате лежит по другую сторону от сектора, и
    // прижатие даёт ноль — тогда точка — середина дуги (sx, sy — диагональ):
    // на кромке и без прыжка при движении окна. Для тела сбоку от дуги
    // прижатие даёт конец дуги, совпадающий с концом прямой стены.
    const px = Math.max(core.x, Math.min(c.cx, core.x + core.w));
    const py = Math.max(core.y, Math.min(c.cy, core.y + core.h));
    const vx = Math.max(0, (px - c.cx) * c.sx) * c.sx;
    const vy = Math.max(0, (py - c.cy) * c.sy) * c.sy;
    const len = Math.hypot(vx, vy);
    const ux = len === 0 ? c.sx / Math.SQRT2 : vx / len;
    const uy = len === 0 ? c.sy / Math.SQRT2 : vy / len;
    return fromEdge({ x: c.cx + arc * ux, y: c.cy + arc * uy }, 0);
  });

  return [...sides, ...arcs];
};
```

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `node --test tests/geometry.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Линт и типы**

Run: `npx eslint --fix lib/liquid/geometry.ts tests/geometry.test.ts && npx tsc --noEmit --pretty false`
Expected: чисто.

- [ ] **Step 6: Показать статус (без коммита)**

Run: `git status --short`

---

### Task 3: Капсулы и закон ширины

**Files:**
- Create: `../../../src/lib`
- Test: `tests/bridges.test.ts`

**Interfaces:**
- Consumes: `Body`, `FrameSpec`, `Contact`, `contactBetween`, `contactsWithFrame` из Tasks 1–2.
- Produces:
  - `interface Bridge { centerX: number; centerY: number; length: number; width: number; angle: number }` — `angle` — направление a→b в радианах (`Math.atan2`, диапазон `(−π, π]`); капсула симметрична, поэтому диапазон нормализовать не нужно.
  - `interface BridgeSpec { frame: FrameSpec; reach: number; cornerHalfWidth: number; intoBody: number }`
  - `sigmaOf(meltRadius: number): number` — σ размытия.
  - `bridgeSpecFor(frame: FrameSpec, opts: { meltRadius: number; reach: number }): BridgeSpec`
  - `halfWidth(contact: Contact, spec: BridgeSpec): number`
  - `bridges(bodies: Body[], spec: BridgeSpec): Bridge[]`

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/bridges.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Bridge,
  bridgeSpecFor,
  bridges,
  halfWidth,
} from '../lib/liquid/bridges.ts';
import {
  type Body,
  type FrameSpec,
  contactBetween,
} from '../lib/liquid/geometry.ts';

const frame: FrameSpec = { w: 1260, h: 840, border: 4, screenRadius: 10 };
const spec = bridgeSpecFor(frame, { meltRadius: 10, reach: 44 });
const body = (
  x: number,
  y: number,
  w = 100,
  h = 100,
  cornerRadius = 12,
): Body => ({
  x,
  y,
  w,
  h,
  cornerRadius,
});
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
// Капсула симметрична: угол и знак направления a→b на форму не влияют.
const key = (b: Bridge) =>
  [b.centerX, b.centerY, b.length, b.width]
    .map((v) => v.toFixed(6))
    .join(',');

test('параметры выводятся из настроек: σ и нахлёст как раньше', () => {
  assert.ok(near(spec.cornerHalfWidth, 17));
  assert.ok(near(spec.intoBody, 17));
  assert.ok(near(spec.reach, 44));
});

test('одинокое окно в центре: мостиков нет', () => {
  assert.deepEqual(bridges([body(500, 400)], spec), []);
});

test('окно у стены: ширина — вся прямая сторона окна, торец внутри тела', () => {
  const [b] = bridges([body(100, 10)], spec);
  assert.ok(near(b.width, 76 * Math.sqrt(1 - 6 / 44))); // 100 − 2·12 — прямая часть
  assert.ok(near(b.length, 6 + 17)); // 6 px зазора + заход в тело, к рамке не лезем
  // Середина отрезка «внутренняя кромка стены (y=4) … на 17 внутрь тела (y=27)».
  assert.ok(near(b.centerY, 15.5));
  assert.ok(near(b.angle, -Math.PI / 2));
  assert.ok(near(b.centerX, 150));
});

test('диагональ: капля рождается из нуля, растёт без прыжков, в контакте — полная', () => {
  const a = body(200, 200);
  // B идёт по диагонали от зазора ≈43.9 (почти reach) до нахлёста 18 px.
  const at = (t: number) => {
    const out = bridges([a, body(324 - t, 324 - t)], spec);
    assert.equal(out.length, 1, `t = ${t}`);
    return out[0];
  };
  let prev = at(0);
  assert.ok(prev.width < 2, `на старте капля тонкая: ${prev.width}`);
  for (let i = 1; i <= 100; i++) {
    const t = i * 0.44;
    const b = at(t);
    assert.ok(b.width >= prev.width - 1e-9, `t = ${t}: ширина уменьшилась`);
    assert.ok(b.width - prev.width < 8, `t = ${t}: скачок ширины`);
    prev = b;
  }
  assert.ok(near(prev.width, 34), `в контакте ширина 34: ${prev.width}`);
});

test('зазор дальше reach: мостика нет; на reach — мертвая точка', () => {
  const a = body(200, 200);
  const far = contactBetween(a, body(500, 500));
  assert.ok(far);
  const wide = { ...far, gap: 44, seam: 0 };
  assert.equal(halfWidth(wide, spec), 0);
});

test('перелёт: ширина не меньше контактной', () => {
  const a = body(200, 200);
  const deep = contactBetween(a, body(280, 280));
  assert.ok(deep && deep.gap < 0);
  assert.ok(near(halfWidth(deep, spec), 17));
});

test('порядок тел не влияет на набор мостиков', () => {
  const a = body(200, 200);
  const b = body(240, 240);
  assert.deepEqual(
    bridges([a, b], spec).map(key).sort(),
    bridges([b, a], spec).map(key).sort(),
  );
});

test('четыре стены: один и тот же зазор даёт одну и ту же каплю', () => {
  const gap = 20; // тело в 20 px от внутренней кромки
  const scenes: Body[][] = [
    [body(500, frame.border + gap)], // верх
    [body(500, frame.h - frame.border - gap - 100)], // низ
    [body(frame.border + gap, 300)], // лево
    [body(frame.w - frame.border - gap - 100, 300)], // право
  ];
  const out = scenes.map((bodies) => bridges(bodies, spec));
  for (const list of out) assert.equal(list.length, 1);
  const widths = out.map(([b]) => b.width);
  for (const w of widths) assert.ok(near(w, widths[0]));
});
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `node --test tests/bridges.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` для `../../../src/lib`.

- [ ] **Step 3: Реализовать**

Создать `../../../src/lib`:

```ts
// Мостик — единственный примитив соединения: капсула (повёрнутый скруглённый
// прямоугольник), натянутая между ближайшими точками двух кромок.
import {
  type Body,
  type Contact,
  type FrameSpec,
  contactBetween,
  contactsWithFrame,
} from './geometry.ts';

export interface Bridge {
  centerX: number;
  centerY: number;
  /** Длина вдоль оси капсулы (от торца до торца). */
  length: number;
  /** Ширина поперёк оси (вдоль стыка). */
  width: number;
  /** Поворот в радианах — направление a→b (как Math.atan2); капсула симметрична. */
  angle: number;
}

export interface BridgeSpec {
  frame: FrameSpec;
  /** Зазор, на котором капля умирает. */
  reach: number;
  /** Полуширина капли при стыке точка-в-точку (нет общего участка рёбер). */
  cornerHalfWidth: number;
  /** Насколько материал заходит внутрь тела, чтобы blur сварил стык. */
  intoBody: number;
}

/**
 * σ размытия под meltRadius. Размытие — «колокол»: две параллельные кромки
 * сливаются, когда зазор падает до ≈1.35σ (замерено), поэтому σ = R/1.35.
 */
export const sigmaOf = (meltRadius: number) => Math.max(1, meltRadius / 1.35);

/** Числа капсулы из настроек: нахлёст прячет торец под телом (2σ + 2 px). */
export const bridgeSpecFor = (
  frame: FrameSpec,
  opts: { meltRadius: number; reach: number },
): BridgeSpec => {
  const overlap = Math.ceil(2 * sigmaOf(opts.meltRadius)) + 2;
  return {
    frame,
    reach: opts.reach,
    cornerHalfWidth: overlap,
    intoBody: overlap,
  };
};

/**
 * Полуширина капли: base·√(1 − gap/reach), base = max(seam/2, cornerHalfWidth).
 *
 *  - грань к грани: seam — длина общего участка прямых сторон, при контакте
 *    капля занимает его целиком — это прежний вид «сварено по шву»;
 *  - угол к углу, к дуге и в момент перехода «диагональ → ребро» seam = 0,
 *    поэтому base держится не ниже cornerHalfWidth: капля рождается тонкой
 *    и растёт, а в самый момент переключения не схлопывается.
 * Перелёт (gap < 0) считаем контактом: ширина не падает ниже максимума.
 */
export const halfWidth = (contact: Contact, spec: BridgeSpec) => {
  const gap = Math.max(0, contact.gap);
  if (gap >= spec.reach) return 0;
  const base = Math.max(contact.seam / 2, spec.cornerHalfWidth);
  return base * Math.sqrt(1 - gap / spec.reach);
};

/**
 * Все мостики сцены. Для рамки материал заканчивается на внутренней кромке
 * (за кольцо не лезем — иначе у угла экрана blur покажет жидкость вне обводки),
 * для тел — заходит внутрь на intoBody.
 */
export const bridges = (bodies: Body[], spec: BridgeSpec): Bridge[] => {
  const out: Bridge[] = [];
  const add = (contact: Contact, intoB: number) => {
    const half = halfWidth(contact, spec);
    if (half < 0.5) return; // тоньше пикселя порог всё равно съест
    const length = contact.gap + spec.intoBody + intoB;
    if (length <= 0) return; // перелёт глубже нахлёста: тела уже слиты
    const shift = (contact.gap + intoB - spec.intoBody) / 2;
    const angle = Math.atan2(contact.ny, contact.nx);
    out.push({
      centerX: contact.a.x + contact.nx * shift,
      centerY: contact.a.y + contact.ny * shift,
      length,
      width: half * 2,
      angle,
    });
  };
  for (const body of bodies)
    for (const contact of contactsWithFrame(body, spec.frame)) add(contact, 0);
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const contact = contactBetween(bodies[i], bodies[j]);
      if (contact) add(contact, spec.intoBody);
    }
  return out;
};
```

- [ ] **Step 4: Убедиться, что тест зелёный**

Run: `node --test tests/bridges.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Линт и типы**

Run: `npx eslint --fix lib/liquid/bridges.ts tests/bridges.test.ts && npx tsc --noEmit --pretty false`
Expected: чисто.

- [ ] **Step 6: Показать статус (без коммита)**

Run: `git status --short`

---

### Task 4: CPU-модель слоя жидкости и базовые инварианты

**Files:**
- Create: `tests/support/raster.ts`
- Create: `tests/support/scenarios.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `Body`, `Bridge`, `bridges`, `bridgeSpecFor`, `sigmaOf`.
- Produces:
  - `interface Scene { width: number; height: number; border: number; screenRadius: number; bodies: Body[]; bridges: Bridge[] }`
  - `interface Raster { width: number; height: number; alpha: Uint8Array; material: Uint8Array; scale: number }`
  - `renderGoo(scene, { sigma, scale? }): Raster` — σ в логических px, как у реальной гауссовой размывки
  - `reaches(raster, from: Point, target: (x, y) => boolean): boolean`
  - `addedArea(raster): number`
  - `cornerRoomDirty(raster, field): string[]`
  - В `scenarios.ts`: `FIELD`, `MELT`, `NOTES`, `MIXER`, `WINDOW_RADIUS`, `body`, `render`, `frameOf`.

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/render.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { addedArea, cornerRoomDirty, reaches } from './support/raster.ts';
import { FIELD, NOTES, body, render } from './support/scenarios.ts';

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const insideBody = (b) => (x: number, y: number) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const topStrip = (x: number, y: number) =>
  x >= FIELD.border + FIELD.screenRadius &&
  x <= FIELD.width - FIELD.border - FIELD.screenRadius &&
  y >= 0 &&
  y <= FIELD.border;

test('одинокое окно не толстеет: за пределами материала жидкости нет', () => {
  assert.equal(addedArea(render([body(500, 300, NOTES)])), 0);
});

test('мостик тянет жидкость на 20 px, одного blur на столько не хватает', () => {
  const a = body(500, 24, NOTES); // верхняя кромка в 20 px от внутренней кромки
  assert.equal(reaches(render([a]), center(a), topStrip), true);
  assert.equal(reaches(render([a], { withoutBridges: true }), center(a), topStrip), false);
});

test('в комнате у угла экрана жидкости нет, пока окна рядом нет', () => {
  // Полосы заканчиваются в border + screenRadius от угла: вогнутый угол
  // рамки не должен затекать blur-хвостами в комнату.
  assert.deepEqual(cornerRoomDirty(render([]), FIELD), []);
});
```

Создать `tests/support/scenarios.ts`:

```ts
import {
  type BridgeSpec,
  bridgeSpecFor,
  bridges,
  sigmaOf,
} from '../../lib/liquid/bridges.ts';
import type { Body, FrameSpec } from '../../lib/liquid/geometry.ts';
import { type Raster, type Scene, renderGoo } from './raster.ts';

export const FIELD = { width: 1260, height: 840, border: 4, screenRadius: 10 };
// blurScale и sharp — реальные настройки приложения; CPU-модель их не
// использует (σ берётся напрямую, цветовая матрица проверяется вживую).
export const MELT = { meltRadius: 10, blurScale: 3.2, sharp: 2.2, reach: 44 };
export const NOTES = { w: 288, h: 168 };
export const MIXER = { w: 308, h: 158 };
export const WINDOW_RADIUS = 12;

export const frameOf = (field = FIELD): FrameSpec => ({
  w: field.width,
  h: field.height,
  border: field.border,
  screenRadius: field.screenRadius,
});

export const specOf = (field = FIELD): BridgeSpec =>
  bridgeSpecFor(frameOf(field), {
    meltRadius: MELT.meltRadius,
    reach: MELT.reach,
  });

export const body = (x: number, y: number, size: { w: number; h: number }): Body => ({
  x,
  y,
  w: size.w,
  h: size.h,
  cornerRadius: WINDOW_RADIUS,
});

export interface RenderOptions {
  scale?: number;
  withoutBridges?: boolean;
  field?: typeof FIELD;
}

export const render = (bodies: Body[], opts: RenderOptions = {}): Raster => {
  const field = opts.field ?? FIELD;
  const scene: Scene = {
    ...field,
    bodies,
    bridges: opts.withoutBridges ? [] : bridges(bodies, specOf(field)),
  };
  return renderGoo(scene, {
    sigma: sigmaOf(MELT.meltRadius),
    scale: opts.scale,
  });
};
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `node --test tests/render.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` для `./support/raster.ts`.

- [ ] **Step 3: Реализовать CPU-модель**

Создать `tests/support/raster.ts`:

```ts
// CPU-модель слоя жидкости: те же тела и капсулы, box-blur ≈ Gaussian, порог 0.5.
// Это модель алгоритма, а не пиксельная копия GPU: проверяем топологию и
// непрерывность, а не цвет и сглаживание краёв.
import type { Bridge } from '../../lib/liquid/bridges.ts';
import type { Body } from '../../lib/liquid/geometry.ts';

export interface Scene {
  width: number;
  height: number;
  border: number;
  screenRadius: number;
  bodies: Body[];
  bridges: Bridge[];
}

export interface Raster {
  width: number;
  height: number;
  /** Уже с порогом: 1 — жидкость. */
  alpha: Uint8Array;
  /** Материал до размытия (полосы, тела, мостики). */
  material: Uint8Array;
  scale: number;
}

/** Расстояние до скруглённого прямоугольника (SDF), ≤ 0 — внутри. */
const roundedSdf = (
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
};

/**
 * Мостик: тот же скруглённый прямоугольник, что рисует Gsk, — повёрнутый на
 * angle вокруг центра, радиус min(length, width)/2. Крутим точку в систему
 * мостика, поэтому формула та же, что у тел.
 */
const bridgeSdf = (
  px: number,
  py: number,
  b: { centerX: number; centerY: number; length: number; width: number; angle: number },
) => {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  const dx = px - b.centerX;
  const dy = py - b.centerY;
  return roundedSdf(
    dx * cos + dy * sin,
    -dx * sin + dy * cos,
    -b.length / 2,
    -b.width / 2,
    b.length,
    b.width,
    Math.min(b.length, b.width) / 2,
  );
};

/** Радиус одной box-свёртки под суммарную σ при трёх проходах. */
const boxRadius = (sigma: number) =>
  Math.max(1, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2));

const boxPass = (
  input: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
) => {
  const out = new Float32Array(input.length);
  const len = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const at = horizontal
    ? (line: number, i: number) => line * w + i
    : (line: number, i: number) => i * w + line;
  for (let line = 0; line < outer; line++) {
    let sum = 0;
    for (let i = 0; i <= Math.min(r, len - 1); i++) sum += input[at(line, i)];
    for (let i = 0; i < len; i++) {
      out[at(line, i)] = sum / (2 * r + 1);
      if (i + r + 1 < len) sum += input[at(line, i + r + 1)];
      if (i - r >= 0) sum -= input[at(line, i - r)];
    }
  }
  return out;
};

/** Blur с прозрачностью за краем (как Gsk: вне узла альфа 0). */
const blur = (src: Float32Array, w: number, h: number, sigma: number) => {
  const r = boxRadius(sigma);
  let cur = src;
  for (let i = 0; i < 3; i++) {
    cur = boxPass(cur, w, h, r, true);
    cur = boxPass(cur, w, h, r, false);
  }
  return cur;
};

// σ — собственно гауссова сигма в логических px. У GTK `push_blur` аргумент
// — «радиус» ≈ 3.2σ (поэтому LiquidField умножает σ на blurScale); CPU-модель
// принимает σ напрямую, иначе blur в модели был бы в 3.2 раза шире реального.
export const renderGoo = (
  scene: Scene,
  opts: { sigma: number; scale?: number },
): Raster => {
  const scale = opts.scale ?? 0.5;
  const width = Math.ceil(scene.width * scale);
  const height = Math.ceil(scene.height * scale);
  // Поля вокруг экрана, как в LiquidField: рамка уходит за край, чтобы blur не
  // съел полосу с наружной стороны. В результат поля не входят.
  const sigmaPx = opts.sigma * scale;
  const pad = Math.ceil(sigmaPx * 5) + 8;
  const cw = width + 2 * pad;
  const ch = height + 2 * pad;
  const canvas = new Uint8Array(cw * ch);
  const px = (v: number) => v * scale;

  /** Залить логические координаты по предикату (предикат тоже в логике). */
  const mark = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    test: (x: number, y: number) => boolean,
  ) => {
    const xs = Math.max(0, Math.floor(px(x0) + pad));
    const xe = Math.min(cw - 1, Math.ceil(px(x1) + pad));
    const ys = Math.max(0, Math.floor(px(y0) + pad));
    const ye = Math.min(ch - 1, Math.ceil(px(y1) + pad));
    for (let y = ys; y <= ye; y++)
      for (let x = xs; x <= xe; x++)
        if (test((x + 0.5 - pad) / scale, (y + 0.5 - pad) / scale))
          canvas[y * cw + x] = 1;
  };

  // Полосы рамки — только прямые участки (углы без материала, см. спеку);
  // уходят за экран, как в LiquidField.
  const end = scene.border + scene.screenRadius;
  const far = 1e4;
  mark(end, -far, scene.width - end, scene.border, () => true); // верх
  mark(end, scene.height - scene.border, scene.width - end, scene.height + far, () => true);
  mark(-far, end, scene.border, scene.height - end, () => true); // лево
  mark(scene.width - scene.border, end, scene.width + far, scene.height - end, () => true);

  for (const b of scene.bodies)
    mark(b.x, b.y, b.x + b.w, b.y + b.h, (x, y) =>
      roundedSdf(x, y, b.x, b.y, b.w, b.h, b.cornerRadius) <= 0,
    );

  for (const b of scene.bridges) {
    // AABB повёрнутого прямоугольника мостика.
    const hx =
      Math.abs(Math.cos(b.angle)) * (b.length / 2) +
      Math.abs(Math.sin(b.angle)) * (b.width / 2);
    const hy =
      Math.abs(Math.sin(b.angle)) * (b.length / 2) +
      Math.abs(Math.cos(b.angle)) * (b.width / 2);
    mark(b.centerX - hx, b.centerY - hy, b.centerX + hx, b.centerY + hy, (x, y) =>
      bridgeSdf(x, y, b) <= 0,
    );
  }

  const blurred = blur(Float32Array.from(canvas), cw, ch, sigmaPx);
  const alpha = new Uint8Array(width * height);
  const material = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const src = (y + pad) * cw + (x + pad);
      alpha[y * width + x] = blurred[src] > 0.5 ? 1 : 0;
      material[y * width + x] = canvas[src];
    }
  return { width, height, alpha, material, scale };
};

/** Есть ли путь по жидкости от логической точки from до любой точки target. */
export const reaches = (
  raster: Raster,
  from: { x: number; y: number },
  target: (x: number, y: number) => boolean,
): boolean => {
  const sx = Math.min(raster.width - 1, Math.max(0, Math.floor(from.x * raster.scale)));
  const sy = Math.min(raster.height - 1, Math.max(0, Math.floor(from.y * raster.scale)));
  const start = sy * raster.width + sx;
  if (!raster.alpha[start]) return false;
  const seen = new Uint8Array(raster.alpha.length);
  const queue: number[] = [start];
  seen[start] = 1;
  while (queue.length) {
    const at = queue.pop()!;
    const x = at % raster.width;
    const y = (at - x) / raster.width;
    if (target((x + 0.5) / raster.scale, (y + 0.5) / raster.scale)) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) continue;
      const ni = ny * raster.width + nx;
      if (!seen[ni] && raster.alpha[ni]) {
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return false;
};

/** Площадь жидкости, которой нет в материале: добавка от blur и мостиков. */
export const addedArea = (raster: Raster) => {
  let count = 0;
  for (let i = 0; i < raster.alpha.length; i++)
    if (raster.alpha[i] && !raster.material[i]) count++;
  return count;
};

/**
 * Жидкость в комнате у углов экрана. Квадрат [border + r, border + 3r]² от угла —
 * это уже комната за кольцом обводки (внутреннее скругление r, далее кольцо
 * шириной border). Без окон там должно быть пусто: иначе хвост blur затекает
 * из вогнутого угла рамки — именно так выглядел старый «уголок» жидкости.
 */
export const cornerRoomDirty = (
  raster: Raster,
  field: { width: number; height: number; border: number; screenRadius: number },
): string[] => {
  const r = field.screenRadius;
  const b = field.border;
  const size = 2 * r;
  const corners = [
    { name: 'ЛВ', x: b + r, y: b + r },
    { name: 'ПВ', x: field.width - b - 3 * r, y: b + r },
    { name: 'ЛН', x: b + r, y: field.height - b - 3 * r },
    { name: 'ПН', x: field.width - b - 3 * r, y: field.height - b - 3 * r },
  ];
  const dirty: string[] = [];
  for (const c of corners) {
    const xs = Math.floor(c.x * raster.scale);
    const ys = Math.floor(c.y * raster.scale);
    const span = Math.ceil(size * raster.scale);
    let bad = 0;
    for (let y = ys; y < Math.min(raster.height, ys + span); y++)
      for (let x = xs; x < Math.min(raster.width, xs + span); x++)
        if (raster.alpha[y * raster.width + x]) bad++;
    if (bad > 0) dirty.push(`${c.name}: ${bad}`);
  }
  return dirty;
};
```

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `node --test tests/render.test.ts`
Expected: PASS (3 теста). Если «одинокое окно» падает — проверить, что материал полос начинается от `border + screenRadius` и что порог строгий (`> 0.5`). Если «мостик тянет жидкость» не проходит — σ модели должна быть `sigmaOf(meltRadius)` без `blurScale` (иначе blur один дотягивается до 20 px).

- [ ] **Step 5: Линт (типы тестов не проверяются tsc)**

Run: `npx eslint --fix tests/support/raster.ts tests/support/scenarios.ts tests/render.test.ts`
Expected: чисто (или только стилевые правки).

- [ ] **Step 6: Показать статус (без коммита)**

Run: `git status --short`

---

### Task 5: Сценарии, инварианты и GIF

**Files:**
- Modify: `tests/support/scenarios.ts`
- Modify: `tests/render.test.ts`
- Create: `tests/visual/gifs.ts`

**Interfaces:**
- Consumes: всё из Task 4.
- Produces:
  - `interface Scenario { name: string; crop: { x: number; y: number; w: number; h: number }; frames: Body[][] }`
  - `scenarioList(): Scenario[]` — имена `diagonal`, `nook-top`, `nook-bottom`, `nook-left`, `nook-right`, `corner`, `snap`.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `tests/render.test.ts`:

```ts
import type { Body } from '../lib/liquid/geometry.ts';
import { scenarioList } from './support/scenarios.ts';

const byName = (name: string) => {
  const found = scenarioList().find((s) => s.name === name);
  assert.ok(found, `сценарий ${name}`);
  return found;
};

test('диагональ: связь появляется один раз и симметрично исчезает', () => {
  const { frames } = byName('diagonal');
  const half = Math.floor(frames.length / 2);
  const forward = frames.slice(0, half);
  const back = frames.slice(half).reverse(); // те же d, что в forward
  const paths = (list: typeof forward) =>
    list.map((bodies) => reaches(render(bodies), center(bodies[1]), insideBody(bodies[0])));
  const fwd = paths(forward);
  const bwd = paths(back);
  const appear = fwd.indexOf(true);
  assert.ok(appear > 0, 'в начале пути связи нет');
  assert.ok(fwd.slice(appear).every(Boolean), 'по пути к контакту связь пропала');
  assert.deepEqual(bwd, fwd, 'обратный путь: связь на других кадрах');
});

test('диагональ: добавленная площадь растёт без скачков', () => {
  // Кадры 0..30 — путь от 30 px до касания. Дальше корпуса нахлёстываются, и
  // площадь жидкости за их пределами начинает уменьшаться — это не дефект.
  // scale 1: на половинном растре шаг = 2 px, и «шум» квантования сравним с
  // ростом площади.
  const frames = byName('diagonal').frames.slice(0, 31);
  const areas = frames.map((bodies) => addedArea(render(bodies, { scale: 1 })));
  assert.equal(areas[0], 0, 'на старте расстояние между скруглениями больше reach — мостика нет');
  const top = Math.max(...areas);
  assert.ok(top > 0, 'мостик так и не появился');
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i] >= areas[i - 1] * 0.95, `кадр ${i}: площадь упала`);
    assert.ok(
      Math.abs(areas[i] - areas[i - 1]) < top * 0.3,
      `кадр ${i}: скачок площади ${areas[i - 1]} → ${areas[i]} (top ${top})`,
    );
  }
});

test('четыре стены: связь с рамкой наступает на одинаковом зазоре', () => {
  const walls = ['top', 'bottom', 'left', 'right'];
  const gaps = walls.map((wall) => {
    const { frames } = byName(`nook-${wall}`);
    const strips = {
      top: (x: number, y: number) => y <= FIELD.border && x >= 14 && x <= FIELD.width - 14,
      bottom: (x: number, y: number) =>
        y >= FIELD.height - FIELD.border && x >= 14 && x <= FIELD.width - 14,
      left: (x: number, y: number) => x <= FIELD.border && y >= 14 && y <= FIELD.height - 14,
      right: (x: number, y: number) =>
        x >= FIELD.width - FIELD.border && y >= 14 && y <= FIELD.height - 14,
    }[wall];
    // Меряем только подвижное окно: оно связано с соседом сбоку, и иначе
    // связь с рамкой «протекает» через соседа.
    const linked = ([, b]: Body[]) => reaches(render([b]), center(b), strips);
    const first = frames.findIndex(linked);
    assert.ok(first > 0, `${wall}: связь не наступила`);
    return { wall, first, connected: frames.slice(first).every(linked) };
  });
  for (const g of gaps) assert.ok(g.connected, `${g.wall}: после появления связь пропала`);
  // Одна сетка пикселей для всех стен: допускаем разницу в один кадр (2 px),
  // это квантование растра, а не скачок геометрии.
  for (const g of gaps)
    assert.ok(
      Math.abs(g.first - gaps[0].first) <= 1,
      `стена ${g.wall}: другой зазор появления (${g.first} против ${gaps[0].first})`,
    );
});

test('угол экрана: окно подходит по диагонали — связь есть раньше касания', () => {
  // Последний кадр окно уже касается рамки: там связь есть даже без мостиков,
  // поэтому проверять один последний кадр бессмысленно. Ищем кадр появления:
  // он должен быть до касания, и держать его обязан именно мостик.
  const { frames } = byName('corner');
  const target = (x: number, y: number) => x <= FIELD.border || y <= FIELD.border;
  const linked = (bodies: Body[]) => reaches(render(bodies), center(bodies[0]), target);
  const first = frames.findIndex(linked);
  assert.ok(first > 0, 'связь появилась уже в первом кадре');
  assert.ok(first < frames.length - 1, 'связь появилась только когда окно уже касается рамки');
  assert.ok(frames.slice(first).every(linked), 'после появления связь пропала');
  assert.equal(
    reaches(render(frames[first], { withoutBridges: true }), center(frames[first][0]), target),
    false,
    'связь дал не мостик, а один blur',
  );
});

test('снап: по всем кадрам твина связь не пропадает', () => {
  const { frames } = byName('snap');
  let seen = false;
  for (const bodies of frames) {
    const connected = reaches(render(bodies), center(bodies[0]), (x, y) => y <= FIELD.border);
    if (seen) assert.ok(connected, 'связь пропала во время твина');
    seen ||= connected;
  }
  assert.ok(seen, 'после снапа связи нет');
});
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

Run: `node --test tests/render.test.ts`
Expected: FAIL — `scenarioList is not a function`.

- [ ] **Step 3: Реализовать сценарии**

Дописать в `tests/support/scenarios.ts`:

```ts
export interface Scenario {
  name: string;
  /** Область для GIF, логические px. */
  crop: { x: number; y: number; w: number; h: number };
  frames: Body[][];
}

/** Диагональ: B смещается к A по диагонали шагом 1 px и возвращается. */
const diagonal = (): Body[][] => {
  const a = body(200, 200, NOTES);
  const frames: Body[][] = [];
  for (let d = 30; d >= -20; d--) frames.push([a, body(488 + d, 368 + d, MIXER)]);
  for (let d = -20; d <= 30; d++) frames.push([a, body(488 + d, 368 + d, MIXER)]);
  return frames;
};

/**
 * Ниша: A приклеено к стене, B едет вдоль A к той же стене.
 * Параметр g — зазор B до внутренней кромки, 60 → 0 шагом 2.
 */
const nook = (wall: 'top' | 'bottom' | 'left' | 'right'): Body[][] => {
  const frames: Body[][] = [];
  for (let g = 60; g >= 0; g -= 2) {
    const b = { w: MIXER.w, h: MIXER.h };
    switch (wall) {
      case 'top':
        frames.push([body(400, 4, NOTES), body(718, 4 + g, b)]);
        break;
      case 'bottom':
        frames.push([body(400, 668, NOTES), body(718, 836 - MIXER.h - g, b)]);
        break;
      case 'left':
        frames.push([body(4, 300, NOTES), body(4 + g, 498, b)]);
        break;
      case 'right':
        frames.push([body(968, 300, NOTES), body(1256 - MIXER.w - g, 498, b)]);
        break;
    }
  }
  return frames;
};

/** Угол: окно едет по диагонали к левому верхнему углу, 60 → 0 шагом 4. */
const corner = (): Body[][] => {
  const frames: Body[][] = [];
  for (let d = 60; d >= 0; d -= 4)
    frames.push([body(FIELD.border + d, FIELD.border + d, NOTES)]);
  return frames;
};

/** Снап: easeOutBack-перелёт от свободной точки к верхней стене. */
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

const snap = (): Body[][] => {
  const from = { x: 500, y: 260 };
  const to = { x: 500, y: FIELD.border };
  const frames: Body[][] = [];
  for (let i = 0; i <= 30; i++) {
    const k = easeOutBack(i / 30);
    frames.push([body(from.x, from.y + (to.y - from.y) * k, NOTES)]);
  }
  return frames;
};

export const scenarioList = (): Scenario[] => [
  { name: 'diagonal', crop: { x: 180, y: 180, w: 560, h: 420 }, frames: diagonal() },
  { name: 'nook-top', crop: { x: 380, y: 0, w: 660, h: 260 }, frames: nook('top') },
  { name: 'nook-bottom', crop: { x: 380, y: 580, w: 660, h: 260 }, frames: nook('bottom') },
  { name: 'nook-left', crop: { x: 0, y: 280, w: 620, h: 400 }, frames: nook('left') },
  { name: 'nook-right', crop: { x: 640, y: 280, w: 620, h: 400 }, frames: nook('right') },
  { name: 'corner', crop: { x: 0, y: 0, w: 380, h: 320 }, frames: corner() },
  { name: 'snap', crop: { x: 380, y: 0, w: 560, h: 300 }, frames: snap() },
];
```

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `node --test tests/render.test.ts`
Expected: PASS (8 тестов). Если ниши не совпадают по зазору — искать ошибку знака в `contactsWithFrame` для низа/справа. Если падает «связь не наступила» — убедиться, что тест рендерит только подвижное тело.

- [ ] **Step 5: Написать генератор GIF**

Создать `tests/visual/gifs.ts`:

```ts
// node tests/visual/gifs.ts — рисует сценарии в GIF (тесты не запускают).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { render, scenarioList } from '../support/scenarios.ts';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const writePpm = (
  path: string,
  raster: { width: number; height: number; alpha: Uint8Array; scale: number },
  crop: { x: number; y: number; w: number; h: number },
) => {
  const x0 = Math.floor(crop.x * raster.scale);
  const y0 = Math.floor(crop.y * raster.scale);
  const w = Math.min(raster.width - x0, Math.ceil(crop.w * raster.scale));
  const h = Math.min(raster.height - y0, Math.ceil(crop.h * raster.scale));
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = raster.alpha[(y + y0) * raster.width + x + x0];
      const i = (y * w + x) * 3;
      pixels[i] = on ? 236 : 18;
      pixels[i + 1] = on ? 240 : 20;
      pixels[i + 2] = on ? 245 : 26;
    }
  writeFileSync(path, Buffer.concat([header, pixels]));
};

const gif = (name: string, frames: string[], dir: string) => {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '20', '-i', join(dir, 'f-%03d.ppm'),
    '-vf', 'scale=iw*2:ih*2:flags=neighbor,palettegen', join(dir, 'palette.png'),
  ]);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '20', '-i', join(dir, 'f-%03d.ppm'),
    '-i', join(dir, 'palette.png'),
    '-lavfi', 'scale=iw*2:ih*2:flags=neighbor[x];[x][1:v]paletteuse',
    join(out, `${name}.gif`),
  ]);
  console.log(`${name}.gif: ${frames.length} кадров`);
};

for (const scenario of scenarioList()) {
  const dir = join(tmpdir(), `liquid-${scenario.name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames: string[] = [];
  scenario.frames.forEach((bodies, i) => {
    const path = join(dir, `f-${String(i).padStart(3, '0')}.ppm`);
    writePpm(path, render(bodies), scenario.crop);
    frames.push(path);
  });
  gif(scenario.name, frames, dir);
}
```

- [ ] **Step 6: Сгенерировать и посмотреть GIF**

Run: `node tests/visual/gifs.ts`
Expected: в `tests/visual/out/` семь файлов. Открыть `diagonal.gif` и `nook-top.gif` (Read по PNG-отрисовке кадра или просмотрщик) — капля растёт из нуля, в нише нет «заноза».

- [ ] **Step 7: Линт и статус**

Run: `npx eslint --fix tests/support/scenarios.ts tests/render.test.ts tests/visual/gifs.ts && git status --short`

---

### Task 6: Переключить LiquidField на мостики

**Files:**
- Modify: `../../../src/lib`
- Modify: `../../../src/lib`
- Delete: `../../../src/lib`, `tests/waist.test.ts`

**Interfaces:**
- Consumes: `bridges`, `bridgeSpecFor`, `sigmaOf`, `Bridge` из `../../../src/lib`; `Body` из `../../../src/lib`.
- Produces: `LiquidField` без `anchors`/`settling`; `Frame.rects(): Rect[]` без `id`; `Frame.tick()` без `field.settling`.

- [ ] **Step 1: Проба поворота капсулы на живом инстансе**

Временно вставить в `drawGoo` (после `drawWindows()`) одну капсулу под 30°:

```ts
snapshot.save();
snapshot.transform(
  Gsk.Transform.new()
    .translate(new Graphene.Point().init(600, 400))
    .rotate(30),
);
const probe = new Graphene.Rect().init(-80, -20, 160, 40);
snapshot.push_rounded_clip(new Gsk.RoundedRect().init_from_rect(probe, 20));
snapshot.append_color(solid, probe);
snapshot.pop();
snapshot.restore();
```

Перезапустить и снять:

```bash
ags quit -i ags
nohup ags run /home/mihail/Projects/Stuff/ags/app.tsx > /tmp/ags-27.log 2>&1 &
sleep 2
/nix/store/dbp1icvskyr9swyf9chyrjfwhdv3nylc-grim-1.5.0/bin/grim -o eDP-1 /tmp/probe.png
```

Прочитать `/tmp/probe.png`: капсула лежит по диагонали (по часовой) в точке (600, 400), торец скруглён. Если GTK не знает `snapshot.save/restore` — заменить на `snapshot.push_transform(...)`/`pop` (фолбэк из спеки). Удалить пробу сразу после проверки.

- [ ] **Step 2: Переписать LiquidField**

Заменить импорт `./waist` на:

```ts
import {
  type Bridge,
  bridgeSpecFor,
  bridges,
  sigmaOf,
} from './liquid/bridges';
import type { Body } from './liquid/geometry';
```

Удалить из класса поля `anchors`, `anchorClock`, `settling`; в `Rect` убрать поле `id`; в `FieldStyle` переименовать `radius` в `screenRadius` (R10).

В `vfunc_snapshot` удалить блок с `GLib.get_monotonic_time`, `anchorClock`, `anchors.begin/slide/end`; импорт `GLib` удалить — он был только ради часов якорей.

`drawGooFrame` упростить до полос (удалить `cornerPatches`/`cornerTongues`):

```ts
const drawGooFrame = () => {
  const end = border + screenRadius; // где начинается прямая часть стены
  const thickness = border + margin; // за экран, чтобы blur не съел край
  fill(snapshot, solid, end, -margin, width - 2 * end, thickness); // верх
  fill(snapshot, solid, end, height - border, width - 2 * end, thickness); // низ
  fill(snapshot, solid, -margin, end, thickness, height - 2 * end); // лево
  fill(snapshot, solid, width - border, end, thickness, height - 2 * end); // право
};
```

Добавить рисование мостиков и вызвать его вместо `waists`:

```ts
/**
 * Капсула мостика: поворачиваем систему координат вокруг её центра,
 * рисуем скруглённый прямоугольник [-L/2, -W/2, L, W] и возвращаем координаты.
 * Радиус — min(L, W)/2: больше половины меньшей стороны Gsk не примет; при
 * малом зазоре L < W, и торец выходит скруглённым по длине мостика.
 */
const drawBridges = (list: Bridge[]) => {
  for (const bridge of list) {
    snapshot.save();
    snapshot.transform(
      Gsk.Transform.new()
        .translate(new Graphene.Point().init(bridge.centerX, bridge.centerY))
        .rotate((bridge.angle * 180) / Math.PI),
    );
    const rect = new Graphene.Rect().init(
      -bridge.length / 2,
      -bridge.width / 2,
      bridge.length,
      bridge.width,
    );
    snapshot.push_rounded_clip(
      new Gsk.RoundedRect().init_from_rect(
        rect,
        Math.min(bridge.length, bridge.width) / 2,
      ),
    );
    snapshot.append_color(solid, rect);
    snapshot.pop();
    snapshot.restore();
  }
};
```

В `drawGoo` вместо цикла `waists(...)`:

```ts
const bodies: Body[] = rects.map((rect) => ({
  ...rect,
  cornerRadius: windowRadius,
}));
drawBridges(bridges(bodies, bridgeSpecFor(
  { w: width, h: height, border, screenRadius },
  { meltRadius, reach: waistReach },
)));
```

В `drawGoo` удалить `this.anchors.end()` и `this.settling = ...`; комментарии про якоря/заплатки заменить на короткое описание капсулы.

Сам `sigmaOf` теперь импортируется из `./liquid/bridges` — удалить локальное объявление.

- [ ] **Step 3: Почистить Frame**

В `../../../src/lib`:

- `snapTarget`: `const { border, screenRadius, waistReach } = this.style;` и в объект `snapTo` передать `screenRadius`.
- `rects()` заменить на:

```ts
/** Тела поля в координатах поля. Больше никаких ключей: жидкость — функция раскладки. */
private rects(): Rect[] {
  return this.revealers()
    .map((revealer) => this.boundsOf(revealer))
    .filter((rect): rect is Rect => rect !== null);
}
```

- `tick()`: убрать `this.field.settling` из `busy` (и комментарий про «вес у угла»).

- [ ] **Step 4: Удалить старую геометрию**

```bash
rm lib/waist.ts tests/waist.test.ts
```

- [ ] **Step 5: Прогнать все тесты, типы, линт**

```bash
node --test tests/*.test.ts
npx tsc --noEmit --pretty false
npx eslint --fix lib/LiquidField.ts lib/Frame.ts
grep -rn "settling\|anchors\|anchorTrack\|cornerPatches\|cornerTongues\|waist" lib app.tsx
```

Expected: тесты PASS (geometry/bridges/render/snap), tsc — только старые ошибки из `/nix/store`, новых нет; в выводе grep нет `settling`, `anchors`, `anchorTrack`, `cornerPatches`, `cornerTongues`; `waistReach` допустим — это имя настройки (R8).

- [ ] **Step 6: Живой прогон**

```bash
ags quit -i ags
nohup ags run /home/mihail/Projects/Stuff/ags/app.tsx > /tmp/ags-27.log 2>&1 &
sleep 2
ags request -i ags eDP-1 at notes 400 300
ags request -i ags eDP-1 at mixer 900 500
sleep 1
/nix/store/dbp1icvskyr9swyf9chyrjfwhdv3nylc-grim-1.5.0/bin/grim -o eDP-1 /tmp/liquid-1.png
```

Прочитать `/tmp/liquid-1.png`: оба окна стоят, жидкости между ними и стен ещё нет. Затем подвинуть окна к стене и друг к другу:

```bash
ags request -i ags eDP-1 at notes 400 300
ags request -i ags eDP-1 at mixer 720 20
sleep 0.7
/nix/store/dbp1icvskyr9swyf9chyrjfwhdv3nylc-grim-1.5.0/bin/grim -o eDP-1 /tmp/liquid-2.png
```

Проверить: капля у стены широкая, без ореола вокруг окна; у угла экрана жидкости нет. Диагональ: `at mixer 700 400`, затем шагами `at mixer 690 410` … — снять 3 кадра и убедиться, что капля растёт, а не появляется целиком.

- [ ] **Step 7: Показать статус (без коммита)**

Run: `git status --short`

---

### Task 7: Переименование `radius` → `screenRadius` и финальная проверка

**Files:**
- Modify: `../../../src/lib` (если ещё не), `../../../src/lib`, `../../../src/lib`, `app.tsx`, `tests/snap.test.ts`

**Interfaces:**
- Produces: во всём проекте нет поля `radius` рядом с `windowRadius`; настройка углов экрана называется `screenRadius`.

- [ ] **Step 1: Переименовать**

В `../../../src/lib`: `SnapEnv.radius` → `SnapEnv.screenRadius` (и все использования, включая `clamp`).
В `../../../src/lib`: `style: { border: number; radius: number }` → `{ border: number; screenRadius: number }`, `offset ?? border + style.screenRadius`.
В `app.tsx`: `radius: 10` → `screenRadius: 10`; комментарий `gaps_out/screenRadius`.
В `tests/snap.test.ts`: `radius: 10` → `screenRadius: 10`.
В `../../../src/lib`: `FieldStyle.radius` → `FieldStyle.screenRadius` (если не сделано в Task 6) и все использования.

Проверить, что голого `radius` не осталось:

```bash
grep -rn '\bradius\b' --include='*.ts' --include='*.tsx' lib app.tsx tests | grep -v 'windowRadius\|meltRadius\|screenRadius\|Radius\b'
```

Expected: пусто (или только локальные переменные вроде `const r`).

- [ ] **Step 2: Прогнать всё**

```bash
node --test tests/*.test.ts
npx tsc --noEmit --pretty false
npx eslint --fix lib app.tsx tests
```

Expected: PASS; tsc без новых ошибок; eslint без ошибок.

- [ ] **Step 3: Живой регресс**

Перезапустить и проверить сценарии из спеки:

```bash
ags quit -i ags
nohup ags run /home/mihail/Projects/Stuff/ags/app.tsx > /tmp/ags-28.log 2>&1 &
sleep 2
ags request -i ags eDP-1 at notes 400 300
ags request -i ags eDP-1 at mixer 900 520
sleep 0.5
ags request -i ags eDP-1 at mixer 700 400
sleep 0.5
ags request -i ags eDP-1 at mixer 700 300
```

Отпустить окна перетаскиванием в интерфейсе (снап), проверить: твин `easeOutBack` без разрывов, перелёт не ломает каплю. Снять 2 кадра grim и прочитать.

- [ ] **Step 4: Сравнить до/после и отчитаться**

Сгенерировать GIF: `node tests/visual/gifs.ts`; показать пользователю пути к `tests/visual/out/*.gif` и список сценариев. Отчёт на русском: что удалено, что появилось, какие инварианты автоматически проверяются, что осталось на пункт 4 (подбор `cornerHalfWidth`, `intoBody`, `waistReach`).

- [ ] **Step 5: Показать статус (без коммита)**

Run: `git status --short`
Expected: удалены `../../../src/lib`, `tests/waist.test.ts`; добавлены `../../../src/lib`, `tests/*`.

---

## Self-review

- **Покрытие спеки:** R1 (полосы рамки + тест `cornerRoomDirty`) — Task 4; R2 (тела не меняются) — Task 6; R3 (рост из нуля, симметрия) — Tasks 3, 5; R4 (углы/ниша/диагональ) — Tasks 2, 5; R5 (твин) — Task 5 (`snap`); R6 (нет состояния) — Task 6 (удаление якорей); R7 (GPU) — Task 6 (blur/threshold не меняются); R8/R10 (`screenRadius`) — Tasks 6–7; R9 (рендер-тесты + GIF) — Tasks 4–5.
- **Нет заглушек:** каждый шаг содержит код и команду.
- **Согласованность имён:** `contactBetween`, `contactsWithFrame`, `halfWidth`, `bridges`, `BridgeSpec`, `bridgeSpecFor`, `sigmaOf` используются одинаково во всех задачах; `Contact` с `seam/nx/ny` определён в Task 1 и потребляется в Task 3; `Scene`/`Raster` — Task 4, используются в Task 5.
- **Известное ограничение:** рендер-тесты моделируют порог по альфе без цветовой матрицы (эквивалентно при `alphaGain > 0`), поэтому край не проверяется на пиксель — только топология; записано в §9 спеки.
