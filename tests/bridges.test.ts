import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Bridge,
  bridges,
  bridgeSpecFor,
  halfWidth,
} from '../lib/liquid/bridges.ts';
import {
  type Body,
  contactBetween,
  type FrameSpec,
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
  [b.centerX, b.centerY, b.length, b.width].map((v) => v.toFixed(6)).join(',');

test('параметры выводятся из настроек: σ и нахлёст', () => {
  assert.ok(near(spec.cornerHalfWidth, 17));
  assert.ok(near(spec.intoBody, 17));
  assert.ok(near(spec.reach, 44));
});

test('у reach мостик тонкий: ширина растёт линейно, а не корнем', () => {
  const contact = {
    a: { x: 0, y: 0 },
    b: { x: 43, y: 0 },
    gap: 43,
    seam: 264,
    nx: 1,
    ny: 0,
  };

  assert.ok(near(halfWidth(contact, spec), (264 / 2) * (1 - 43 / 44)));
});

test('одинокое окно в центре: мостиков нет', () => {
  assert.deepEqual(bridges([body(500, 400)], spec), []);
});

test('окно у стены: ширина — вся прямая сторона окна, торец внутри тела', () => {
  const [b] = bridges([body(100, 10)], spec);
  assert.ok(near(b.width, 76 * (1 - 6 / 44))); // 100 − 2·12 — прямая часть
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
  let prev = at(1.5);
  assert.ok(prev.width < 2, `на старте капля тонкая: ${prev.width}`);
  for (let i = 1; i <= 100; i++) {
    const t = 1.5 + i * 0.44;
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

test('тонкая губа: мостик не выходит за тело', () => {
  const top = body(500, frame.border, 100, 9);
  const [vertical] = bridges([top], spec);
  assert.ok(near(vertical.length, 9));
  assert.ok(near(vertical.centerY - vertical.length / 2, top.y));
  assert.ok(near(vertical.centerY + vertical.length / 2, top.y + top.h));

  const right = body(frame.w - frame.border - 9, 300, 9, 100);
  const [horizontal] = bridges([right], spec);
  assert.ok(near(horizontal.length, 9));
  assert.ok(near(horizontal.centerX - horizontal.length / 2, right.x));
  assert.ok(
    near(horizontal.centerX + horizontal.length / 2, right.x + right.w),
  );
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
  for (const list of out) {
    assert.equal(list.length, 1);
  }
  const widths = out.map(([b]) => b.width);
  for (const w of widths) {
    assert.ok(near(w, widths[0]));
  }
});
