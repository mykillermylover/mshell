import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type Body,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '../src/lib/liquid/geometry.ts';
import { type SnapEnv, snapTo } from '../src/lib/snap.ts';

const frame: FrameSpec = { w: 1000, h: 600, border: 4, screenRadius: 10 };
const env: SnapEnv = { frame, reach: 44 };

const body = (
  x: number,
  y: number,
  w = 180,
  h = 100,
  cornerRadius = 12,
): Body => ({ x, y, w, h, cornerRadius });

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

test('стена: окно втягивается вплотную к внутренней кромке', () => {
  assert.deepEqual(snapTo(env, body(10, 250)), { x: 4, y: 250 });
});

test('бок: окно встаёт в стык стороной', () => {
  const other = body(100, 100, 200, 100);
  assert.deepEqual(snapTo(env, body(310, 100), [other]), {
    x: 300,
    y: 100,
  });
});

test('диагональ: касание скруглёнными уголками', () => {
  const other = body(100, 100, 200, 100);
  const result = snapTo(env, body(320, 220), [other]);

  assert.ok(result);
  assert.ok(near(result.x, 292.97));
  assert.ok(near(result.y, 192.97));
});

test('граница waistReach: на reach тянет, дальше — нет', () => {
  assert.deepEqual(snapTo(env, body(48, 250)), { x: 4, y: 250 });
  assert.equal(snapTo(env, body(49, 250)), null);
});

test('угол рамки: две стены закрываются парой', () => {
  assert.deepEqual(snapTo(env, body(48, 48)), { x: 4, y: 4 });
});

test('пара стена + бок окна', () => {
  const other = body(100, 4, 200, 100);
  assert.deepEqual(snapTo(env, body(310, 14), [other]), {
    x: 300,
    y: 4,
  });
});

test('порядок тел не влияет на результат', () => {
  const a = body(100, 100, 200, 100);
  const b = body(100, 300, 200, 100);
  const self = body(320, 220);

  assert.deepEqual(snapTo(env, self, [a, b]), snapTo(env, self, [b, a]));
});

test('третье тело: кандидат с пересечением отбрасывается', () => {
  const c = body(10, 40, 30, 30);
  const result = snapTo(env, body(48, 48), [c]);

  assert.ok(result);

  const moved = body(result.x, result.y);
  const contact = contactBetween(moved, c);

  assert.ok(contact && contact.gap >= -0.01, 'пересекает третье тело');
  assert.ok(
    contactsWithFrame(moved, env.frame).every((item) => item.gap >= -0.01),
    'залезло в материал рамки',
  );
  // Пара «лево + верх» (4, 4) пересекает C и отброшена; побеждает более
  // короткий снап к третьему телу.
  assert.notDeepEqual(result, { x: 4, y: 4 });
});

test('выпихивание: частичное перекрытие по нормали', () => {
  const other = body(100, 100, 200, 100);
  const result = snapTo(env, body(290, 120), [other]);

  assert.ok(result);
  assert.ok(near(result.x, 300, 0.2));
  assert.ok(near(result.y, 120, 0.2));

  const contact = contactBetween(body(result.x, result.y), other);
  assert.ok(contact && contact.gap >= -0.01);
});

test('выпихивание: глубокое перекрытие по оси', () => {
  const other = body(100, 100, 200, 100);
  const result = snapTo(env, body(150, 120), [other]);

  assert.ok(result);
  assert.ok(near(result.y, 200.5, 0.6));

  const contact = contactBetween(body(result.x, result.y), other);
  assert.ok(contact && contact.gap >= -0.01);
});

test('глубокое проникновение в тонкую рамку: выпихивание внутрь', () => {
  assert.deepEqual(snapTo(env, body(0, 250, 180, 100, 4)), {
    x: 4,
    y: 250,
  });
});

test('глубокое проникновение в толстую рамку: выпихивание внутрь', () => {
  const thick: SnapEnv = { frame: { ...frame, border: 20 }, reach: 44 };

  assert.deepEqual(snapTo(thick, body(0, 250, 180, 100, 12)), {
    x: 20,
    y: 250,
  });
  assert.deepEqual(snapTo(thick, body(8, 250, 180, 100, 12)), {
    x: 20,
    y: 250,
  });
});

test('windowRadius = 0: окна стыкуются вплотную', () => {
  const other = body(100, 100, 200, 100, 0);

  assert.deepEqual(snapTo(env, body(310, 100, 180, 100, 0), [other]), {
    x: 300,
    y: 100,
  });
});

test('симметрия: одинаковый зазор на всех четырёх стенах', () => {
  const gap = 6;

  assert.deepEqual(snapTo(env, body(4 + gap, 250)), { x: 4, y: 250 });
  assert.deepEqual(snapTo(env, body(816 - gap, 250)), { x: 816, y: 250 });
  assert.deepEqual(snapTo(env, body(400, 4 + gap)), { x: 400, y: 4 });
  assert.deepEqual(snapTo(env, body(400, 496 - gap)), { x: 400, y: 496 });
});

test('равная дистанция: выбор по ключу не зависит от порядка тел', () => {
  const left = body(260, 250);
  const right = body(640, 250);
  const self = body(450, 250);

  assert.deepEqual(snapTo(env, self, [right, left]), { x: 440, y: 250 });
  assert.deepEqual(snapTo(env, self, [left, right]), { x: 440, y: 250 });
});

test('почти параллельные нормали: выбирается одиночный контакт', () => {
  const a = body(200, 250, 180, 100);
  const b = body(200, 379, 190, 100);
  const result = snapTo(env, body(400, 300), [a, b]);

  assert.ok(result);
  assert.ok(near(result.x, 389.907, 0.05));
  assert.ok(near(result.y, 300.891, 0.05));

  for (const other of [a, b]) {
    const contact = contactBetween(body(result.x, result.y), other);
    assert.ok(contact && contact.gap >= -0.01);
  }
});

test('угол с маленьким windowRadius не залезает в рамку', () => {
  const result = snapTo(env, body(4, 4, 100, 100, 4));

  assert.ok(result);
  assert.ok(
    contactsWithFrame(body(result.x, result.y, 100, 100, 4), env.frame).every(
      (item) => item.gap >= -0.01,
    ),
  );
});
