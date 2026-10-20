import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Body,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '../lib/goo/geometry.ts';

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
const at = (t: number) => contactBetween(body(100, 100), body(240, 240 - t));

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
  let prev = at(0);
  assert.ok(prev);
  for (let i = 1; i <= 280; i++) {
    const t = i * 0.5;
    const c = at(t);
    assert.ok(c, `t = ${t}: контакта нет`);
    assert.ok(
      Math.hypot(c.a.x - prev.a.x, c.a.y - prev.a.y) < 0.6,
      `t = ${t}: a прыгнула`,
    );
    assert.ok(
      Math.hypot(c.b.x - prev.b.x, c.b.y - prev.b.y) < 0.6,
      `t = ${t}: b прыгнула`,
    );
    assert.ok(Math.abs(c.gap - prev.gap) < 0.6, `t = ${t}: зазор прыгнул`);
    prev = c;
  }
  // Тела встали вровень: стык — прямая часть стороны, 100 − 2·12 = 76.
  assert.ok(
    prev.seam > 75,
    `после переключения стык — вся прямая сторона: ${prev.seam}`,
  );
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

const frame: FrameSpec = { w: 1260, h: 840, border: 4, screenRadius: 10 };
const atFrame = (d: number) => contactsWithFrame(body(d, d, 100, 50), frame);

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
  assert.ok(
    near(Math.hypot(arc.b.x - 14, arc.b.y - 14), 10),
    'b на дуге радиуса 10',
  );
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
  let prev = atFrame(160);
  for (let i = 1; i <= 130; i++) {
    const d = 160 - i;
    const cur = atFrame(d);
    for (const index of [0, 2, 4]) {
      assert.ok(
        Math.hypot(
          cur[index].b.x - prev[index].b.x,
          cur[index].b.y - prev[index].b.y,
        ) < 1.6,
        `d = ${d}, контакт ${index}: b прыгнула`,
      );
      assert.ok(
        Math.abs(cur[index].gap - prev[index].gap) < 1.6,
        `d = ${d}, контакт ${index}: зазор прыгнул`,
      );
    }
    prev = cur;
  }
});
