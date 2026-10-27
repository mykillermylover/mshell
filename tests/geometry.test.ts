import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '@lib/field/geometry';

import { makeBody } from './support/body';

const body = makeBody(100);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const at = (t: number) => contactBetween(body(100, 100), body(240, 240 - t));

test('bodies side by side: points on the edges, a clean gap between them', () => {
  const c = contactBetween(body(100, 100), body(240, 100));
  assert.ok(c);
  assert.ok(near(c.a.x, 200) && near(c.a.y, 150), `a = ${c.a.x},${c.a.y}`);
  assert.ok(near(c.b.x, 240) && near(c.b.y, 150), `b = ${c.b.x},${c.b.y}`);
  assert.ok(near(c.gap, 40));
  assert.ok(near(c.seam, 76)); // straight part of the side: 100 − 2·12
  assert.ok(near(c.nx, 1) && near(c.ny, 0));
});

test('diagonal: gap between rounded corners, no joint', () => {
  const c = contactBetween(body(100, 100), body(240, 240));
  assert.ok(c);
  assert.ok(near(c.gap, Math.hypot(64, 64) - 24));
  assert.ok(near(c.a.x, 188 + 12 / Math.SQRT2));
  assert.ok(near(c.a.y, 188 + 12 / Math.SQRT2));
  assert.ok(near(c.b.x, 252 - 12 / Math.SQRT2));
  assert.ok(near(c.b.y, 252 - 12 / Math.SQRT2));
  assert.equal(c.seam, 0);
});

test('diagonal meets the edge without a jump: points, gap and joint stay continuous', () => {
  // B rises toward A; at t = 64 the cores touch along y, and the joint
  // switches from "corner to corner" (seam 0) to "edge to edge" (seam = side).
  let prev = at(0);
  assert.ok(prev);
  for (let i = 1; i <= 280; i++) {
    const t = i * 0.5;
    const c = at(t);
    assert.ok(c, `t = ${t}: no contact`);
    assert.ok(
      Math.hypot(c.a.x - prev.a.x, c.a.y - prev.a.y) < 0.6,
      `t = ${t}: a jumped`,
    );
    assert.ok(
      Math.hypot(c.b.x - prev.b.x, c.b.y - prev.b.y) < 0.6,
      `t = ${t}: b jumped`,
    );
    assert.ok(Math.abs(c.gap - prev.gap) < 0.6, `t = ${t}: gap jumped`);
    prev = c;
  }
  // The bodies are level: the joint is the whole straight side, 100 − 2·12 = 76.
  assert.ok(
    prev.seam > 75,
    `after the switch the joint is the whole straight side: ${prev.seam}`,
  );
});

test('contact does not depend on body order', () => {
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

test('top wall: perpendicular and a point on the inner edge', () => {
  const [top] = contactsWithFrame(body(100, 10, 100, 50), frame);
  assert.ok(near(top.b.x, 150) && near(top.b.y, 4));
  assert.ok(near(top.a.y, 10));
  assert.ok(near(top.gap, 6));
  assert.ok(near(top.seam, 76)); // straight part of the side: 100 − 2·12
});

test('left wall: mirror of the top one', () => {
  const left = contactsWithFrame(body(10, 100, 50, 100), frame)[2];
  assert.ok(near(left.b.x, 4) && near(left.b.y, 150));
  assert.ok(near(left.a.x, 10));
  assert.ok(near(left.gap, 6));
  assert.ok(near(left.seam, 76));
});

test('corner arc: a point on the circle of the frame inner radius', () => {
  // The TL arc center is (border + screenRadius, border + screenRadius) = (14, 14),
  // the radius is screenRadius = 10: this is how append_border draws the frame. The window stands
  // in the interior, to the south-east of the center, so the contact point is the middle of the
  // arc (6.93, 6.93): it lies on the edge and doesn't jump when the window moves.
  const arc = contactsWithFrame(body(20, 20, 100, 50), frame)[4];
  assert.ok(
    near(Math.hypot(arc.b.x - 14, arc.b.y - 14), 10),
    'b on the arc of radius 10',
  );
  assert.ok(
    near(arc.b.x, 14 - 10 / Math.SQRT2) && near(arc.b.y, 14 - 10 / Math.SQRT2),
  );
  assert.ok(
    near(arc.gap, Math.hypot(18 + 10 / Math.SQRT2, 18 + 10 / Math.SQRT2) - 12),
  );
  assert.equal(arc.seam, 0);
});

test('the wall → arc transition is continuous', () => {
  // The window moves diagonally toward the top-left corner: contact with the top wall,
  // with the left wall and with the arc changes without jumps (fixed indices).
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
        `d = ${d}, contact ${index}: b jumped`,
      );
      assert.ok(
        Math.abs(cur[index].gap - prev[index].gap) < 1.6,
        `d = ${d}, contact ${index}: gap jumped`,
      );
    }
    prev = cur;
  }
});
