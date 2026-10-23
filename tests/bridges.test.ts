import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Bridge,
  bridges,
  bridgeShape,
  bridgeSpecFor,
  halfWidth,
} from '@lib/liquid/bridges';
import { contactBetween, type FrameSpec } from '@lib/liquid/geometry';

import { makeBody } from './support/body';

const frame: FrameSpec = { w: 1260, h: 840, border: 4, screenRadius: 10 };
// σ = blurRadius / 1.35 при дефолтном blurRadius = 10.
const spec = bridgeSpecFor(frame, { sigma: 10 / 1.35, reach: 44 });
const body = makeBody(100);

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

test('диагональ: капля рождается из нуля и растёт до контакта', () => {
  const a = body(200, 200);
  const at = (t: number) => bridges([a, body(324 - t, 324 - t)], spec);
  let prev = at(1.5)[0];
  assert.ok(prev, 'на старте (почти reach) мостик есть');
  assert.ok(prev.width < 2, `на старте капля тонкая: ${prev.width}`);
  for (let t = 1.5; ; t += 0.44) {
    const other = body(324 - t, 324 - t);
    const contact = contactBetween(a, other);
    if (!contact || contact.gap < 0) {
      break; // перекрытие: мостик уступает blur
    }
    const b = at(t)[0];
    assert.ok(b, `t = ${t}: мостика нет`);
    assert.ok(b.width >= prev.width - 1e-9, `t = ${t}: ширина уменьшилась`);
    assert.ok(b.width - prev.width < 8, `t = ${t}: скачок ширины`);
    prev = b;
  }
  assert.ok(prev.width > 33, `перед контактом капля широкая: ${prev.width}`);
});

test('диагональ у касания: мостик не пропадает и не сужается', () => {
  const a = body(200, 200);
  let t = 1.5;
  let other = body(324 - t, 324 - t);
  let gap = contactBetween(a, other)?.gap ?? -1;
  while (gap > 0.3) {
    t += 0.05;
    other = body(324 - t, 324 - t);
    gap = contactBetween(a, other)?.gap ?? -1;
  }

  const [bridge] = bridges([a, other], spec);
  assert.ok(bridge, `мостка нет при gap = ${gap}`);
  assert.ok(bridge.width > 33, `ширина на касании: ${bridge.width}`);
  assert.ok(bridgeShape(bridge), 'форма на касании не должна пропадать');
});

test('зазор дальше reach: мостика нет; на reach — мертвая точка', () => {
  const a = body(200, 200);
  const far = bridges([a, body(500, 500)], spec);
  assert.deepEqual(far, []);

  const contact = {
    a: { x: 0, y: 0 },
    b: { x: 44, y: 0 },
    gap: 44,
    seam: 0,
    nx: 1,
    ny: 0,
  };
  assert.equal(halfWidth(contact, spec), 0);
});

test('перелёт: мостик остаётся, ширина максимальная', () => {
  const out = bridges([body(200, 200), body(280, 280)], spec);
  assert.equal(out.length, 1);
  assert.ok(near(out[0].width, 34));
});

test('прижатая губа: мостик к рамке остаётся — он заливает нишу', () => {
  const lip = body(500, frame.border, 100, 9); // зазор 0
  const [b] = bridges([lip], spec);
  assert.ok(near(b.length, 9)); // заход ограничен толщиной губы
  assert.ok(near(b.centerY - b.length / 2, lip.y));
  assert.ok(near(b.centerY + b.length / 2, lip.y + lip.h));
});

test('ниша: прижатое к стене окно даёт flush-мостик win↔рамка', () => {
  const win1 = body(500, frame.border); // 100×100, прижато к верхней стене
  const win2 = body(380, 20);
  const out = bridges([win1, win2], spec);

  // Как в старой реализации: win1↔рамка (flush), win2↔рамка, win2↔win1.
  assert.equal(out.length, 3);
  const flush = out.find((b) => near(b.centerX, 550) && near(b.centerY, 12.5));
  assert.ok(flush, 'нет flush-мостика win1↔рамка');
  assert.ok(near(flush.width, 76) && near(flush.length, 17));
});

test('тонкая губа: заход внутрь не больше толщины', () => {
  const lip = body(500, frame.border + 10, 100, 9); // 10 px до рамки
  const [b] = bridges([lip], spec);
  assert.ok(near(b.length, 10 + 9));
  assert.ok(near(b.centerY - b.length / 2, frame.border));
  assert.ok(near(b.centerY + b.length / 2, frame.border + 10 + 9));
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
  const scenes = [
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

test('угол: в лимит трёх контактов входят две стены и дуга', () => {
  const corner = body(frame.border + 6, frame.border + 6, 100, 100); // зазоры 6, 6, дуга 9.31
  const out = bridges([corner], spec);
  assert.equal(out.length, 3);
  assert.ok(
    out.some(
      (b) =>
        Math.abs(Math.cos(b.angle)) > 0.1 && Math.abs(Math.sin(b.angle)) > 0.1,
    ),
    'дуга даёт диагональный мостик',
  );
});

test('угол рамки: стены не съедают слот соседа', () => {
  const corner = body(frame.border + 6, frame.border + 6); // 3 контакта рамки
  const neighbour = body(120, 120); // диагональ, зазор ~24
  const out = bridges([corner, neighbour], spec);

  assert.equal(out.length, 4); // 3 рамки + пара
  assert.ok(
    out.some((b) => near(Math.abs(b.angle), Math.PI / 4, 1e-6)),
    'нет мостика к соседу',
  );
});

test('равные зазоры на границе K не режутся: четыре взаимные пары', () => {
  const center = body(500, 350);
  const neighbours = [
    body(360, 350),
    body(640, 350),
    body(500, 210),
    body(500, 490),
  ]; // у каждого зазор 40; между собой 66 — вне reach
  const out = bridges([center, ...neighbours], spec);
  assert.equal(out.length, 4); // K=3 + все, у кого зазор равен третьему
});

test('при разных зазорах лимит K=3 работает: четвёртый отбрасывается', () => {
  const center = body(500, 350);
  const neighbours = [
    body(450, 380, 40, 40), // слева, зазор 10
    body(620, 380, 40, 40), // справа, зазор 20
    body(530, 280, 40, 40), // сверху, зазор 30
    body(530, 490, 40, 40), // снизу, зазор 40
  ]; // между собой и стенами — вне reach
  const out = bridges([center, ...neighbours], spec);
  assert.equal(out.length, 3);
});

const manual = (angle: number, length = 100, width = 34): Bridge => ({
  centerX: 10,
  centerY: 20,
  length,
  width,
  angle,
});

test('осевой мостик рисуется скруглённой плашкой без поворота', () => {
  // Нормаль вдоль x: длина — по x, ширина — по y.
  const horizontal = bridgeShape(manual(0));
  assert.ok(horizontal && horizontal.kind === 'rect');
  assert.ok(near(horizontal.x, 10 - 50) && near(horizontal.w, 100));
  assert.ok(near(horizontal.y, 20 - 17) && near(horizontal.h, 34));
  assert.ok(near(horizontal.radius, 17));

  // Нормаль вдоль y: размеры меняются местами.
  const vertical = bridgeShape(manual(-Math.PI / 2));
  assert.ok(vertical && vertical.kind === 'rect');
  assert.ok(near(vertical.x, 10 - 17) && near(vertical.w, 34));
  assert.ok(near(vertical.y, 20 - 50) && near(vertical.h, 100));

  // Широкая плашка: радиус ограничен половиной меньшей стороны.
  const wide = bridgeShape(manual(0, 20, 200));
  assert.ok(wide && wide.kind === 'rect');
  assert.ok(near(wide.radius, 10));
});

test('диагональ рисуется штрихом с круглыми торцами', () => {
  const s = bridgeShape(manual(Math.PI / 4, 74, 34));
  assert.ok(s && s.kind === 'stroke');
  assert.ok(near(s.width, 34));
  const seg = (74 - 34) / 2 / Math.SQRT2;
  assert.ok(near(s.x1, 10 - seg) && near(s.y1, 20 - seg));
  assert.ok(near(s.x2, 10 + seg) && near(s.y2, 20 + seg));
});

test('диагональ в контакте (длина = ширина) — круг, а не пропуск', () => {
  const s = bridgeShape(manual(Math.PI / 4, 34, 34));
  assert.ok(s && s.kind === 'rect');
  assert.ok(near(s.x, 10 - 17) && near(s.y, 20 - 17));
  assert.ok(near(s.w, 34) && near(s.h, 34) && near(s.radius, 17));
});

test('диагональ шире длины: штрих идёт вдоль стыка', () => {
  const s = bridgeShape(manual(Math.PI / 4, 20, 34));
  assert.ok(s && s.kind === 'stroke');
  assert.ok(near(s.width, 20));
  const seg = (34 - 20) / 2;
  const ux = -Math.sin(Math.PI / 4);
  const uy = Math.cos(Math.PI / 4);
  assert.ok(near(s.x1, 10 - ux * seg) && near(s.y1, 20 - uy * seg));
  assert.ok(near(s.x2, 10 + ux * seg) && near(s.y2, 20 + uy * seg));
});

test('реальный мостик у стены: плашка совпадает с геометрией', () => {
  const [b] = bridges([body(100, 10)], spec);
  const s = bridgeShape(b);
  assert.ok(s && s.kind === 'rect');
  assert.ok(near(s.x + s.w / 2, b.centerX));
  assert.ok(near(s.y + s.h / 2, b.centerY));
  assert.ok(near(s.w, b.width) && near(s.h, b.length));
  assert.ok(near(s.radius, Math.min(b.width, b.length) / 2));
});
