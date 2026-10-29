import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { contactBetween, type FrameSpec } from '@lib/field/geometry';
import {
  type Bridge,
  bridges,
  bridgeShape,
  bridgeSpecFor,
  halfWidth,
} from '@lib/liquid/bridges';

import { makeBody } from '../../support/body';

const frame: FrameSpec = { w: 1260, h: 840, border: 4, screenRadius: 10 };
// σ = blurRadius / 1.35 with the default blurRadius = 10.
const spec = bridgeSpecFor(frame, { sigma: 10 / 1.35, reach: 44 });
const body = makeBody(100);

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
// The capsule is symmetric: the angle and the sign of direction a→b do not affect the shape.
const key = (b: Bridge) =>
  [b.centerX, b.centerY, b.length, b.width].map((v) => v.toFixed(6)).join(',');

const manual = (angle: number, length = 100, width = 34): Bridge => ({
  centerX: 10,
  centerY: 20,
  length,
  width,
  angle,
});

describe('bridges', () => {
  describe('spec', () => {
    test('parameters are derived from settings: σ and overlap', () => {
      assert.ok(near(spec.cornerHalfWidth, 17));
      assert.ok(near(spec.intoBody, 17));
      assert.ok(near(spec.reach, 44));
    });

    test('at reach the bridge is thin: width grows linearly, not by a square root', () => {
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
  });

  describe('placement', () => {
    test('a lone window in the center: no bridges', () => {
      assert.deepEqual(bridges([body(500, 400)], spec), []);
    });

    test('window at the wall: width is the whole straight side of the window, end cap inside the body', () => {
      const [b] = bridges([body(100, 10)], spec);
      assert.ok(near(b.width, 76 * (1 - 6 / 44))); // 100 − 2·12 — the straight part
      assert.ok(near(b.length, 6 + 17)); // 6 px gap + inset into the body, we do not go to the frame
      // Middle of the segment "inner edge of the wall (y=4) … 17 inside the body (y=27)".
      assert.ok(near(b.centerY, 15.5));
      assert.ok(near(b.angle, -Math.PI / 2));
      assert.ok(near(b.centerX, 150));
    });

    test('diagonal: the blob is born from zero and grows until contact', () => {
      const a = body(200, 200);
      const at = (t: number) => bridges([a, body(324 - t, 324 - t)], spec);
      let prev = at(1.5)[0];
      assert.ok(prev, 'at the start (almost reach) the bridge exists');
      assert.ok(prev.width < 2, `at the start the blob is thin: ${prev.width}`);
      for (let t = 1.5; ; t += 0.44) {
        const other = body(324 - t, 324 - t);
        const contact = contactBetween(a, other);
        if (!contact || contact.gap < 0) {
          break; // overlap: the bridge yields to blur
        }
        const b = at(t)[0];
        assert.ok(b, `t = ${t}: no bridge`);
        assert.ok(b.width >= prev.width - 1e-9, `t = ${t}: width decreased`);
        assert.ok(b.width - prev.width < 8, `t = ${t}: width jump`);
        prev = b;
      }
      assert.ok(
        prev.width > 33,
        `before contact the blob is wide: ${prev.width}`,
      );
    });

    test('diagonal at contact: the bridge does not disappear and does not narrow', () => {
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
      assert.ok(bridge, `no bridge at gap = ${gap}`);
      assert.ok(bridge.width > 33, `width at contact: ${bridge.width}`);
      assert.ok(bridgeShape(bridge), 'shape at contact must not disappear');
    });

    test('gap beyond reach: no bridge; at reach — a dead point', () => {
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

    test('overshoot: the bridge remains, the width is maximal', () => {
      const out = bridges([body(200, 200), body(280, 280)], spec);
      assert.equal(out.length, 1);
      assert.ok(near(out[0].width, 34));
    });

    test('flush lip: the bridge to the frame remains — it floods the niche', () => {
      const lip = body(500, frame.border, 100, 9); // gap 0
      const [b] = bridges([lip], spec);
      assert.ok(near(b.length, 9)); // the inset is limited by the lip thickness
      assert.ok(near(b.centerY - b.length / 2, lip.y));
      assert.ok(near(b.centerY + b.length / 2, lip.y + lip.h));
    });

    test('niche: a window flush to the wall gives a flush bridge win↔frame', () => {
      const win1 = body(500, frame.border); // 100×100, flush to the top wall
      const win2 = body(380, 20);
      const out = bridges([win1, win2], spec);

      // As in the old implementation: win1↔frame (flush), win2↔frame, win2↔win1.
      assert.equal(out.length, 3);
      const flush = out.find(
        (b) => near(b.centerX, 550) && near(b.centerY, 12.5),
      );
      assert.ok(flush, 'no flush bridge win1↔frame');
      assert.ok(near(flush.width, 76) && near(flush.length, 17));
    });

    test('thin lip: the inset into the body is no larger than the thickness', () => {
      const lip = body(500, frame.border + 10, 100, 9); // 10 px to the frame
      const [b] = bridges([lip], spec);
      assert.ok(near(b.length, 10 + 9));
      assert.ok(near(b.centerY - b.length / 2, frame.border));
      assert.ok(near(b.centerY + b.length / 2, frame.border + 10 + 9));
    });

    test('body order does not affect the set of bridges', () => {
      const a = body(200, 200);
      const b = body(240, 240);
      assert.deepEqual(
        bridges([a, b], spec).map(key).sort(),
        bridges([b, a], spec).map(key).sort(),
      );
    });

    test('four walls: the same gap gives the same blob', () => {
      const gap = 20; // body 20 px from the inner edge
      const scenes = [
        [body(500, frame.border + gap)], // top
        [body(500, frame.h - frame.border - gap - 100)], // bottom
        [body(frame.border + gap, 300)], // left
        [body(frame.w - frame.border - gap - 100, 300)], // right
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

    test('corner: the limit of three contacts includes two walls and the arc', () => {
      const corner = body(frame.border + 6, frame.border + 6, 100, 100); // gaps 6, 6, arc 9.31
      const out = bridges([corner], spec);
      assert.equal(out.length, 3);
      assert.ok(
        out.some(
          (b) =>
            Math.abs(Math.cos(b.angle)) > 0.1 &&
            Math.abs(Math.sin(b.angle)) > 0.1,
        ),
        'the arc produces a diagonal bridge',
      );
    });

    test('frame corner: walls do not eat the neighbor slot', () => {
      const corner = body(frame.border + 6, frame.border + 6); // 3 frame contacts
      const neighbour = body(120, 120); // diagonal, gap ~24
      const out = bridges([corner, neighbour], spec);

      assert.equal(out.length, 4); // 3 frame + pair
      assert.ok(
        out.some((b) => near(Math.abs(b.angle), Math.PI / 4, 1e-6)),
        'no bridge to the neighbor',
      );
    });

    test('equal gaps at the K boundary are not cut: four mutual pairs', () => {
      const center = body(500, 350);
      const neighbours = [
        body(360, 350),
        body(640, 350),
        body(500, 210),
        body(500, 490),
      ]; // each has gap 40; between each other 66 — beyond reach
      const out = bridges([center, ...neighbours], spec);
      assert.equal(out.length, 4); // K=3 + all whose gap equals the third
    });

    test('with different gaps the K=3 limit works: the fourth is dropped', () => {
      const center = body(500, 350);
      const neighbours = [
        body(450, 380, 40, 40), // left, gap 10
        body(620, 380, 40, 40), // right, gap 20
        body(530, 280, 40, 40), // top, gap 30
        body(530, 490, 40, 40), // bottom, gap 40
      ]; // between each other and the walls — beyond reach
      const out = bridges([center, ...neighbours], spec);
      assert.equal(out.length, 3);
    });
  });

  describe('shape', () => {
    test('axis-aligned bridge is drawn as a rounded plate without rotation', () => {
      // Normal along x: length along x, width along y.
      const horizontal = bridgeShape(manual(0));
      assert.ok(horizontal && horizontal.kind === 'rect');
      assert.ok(near(horizontal.x, 10 - 50) && near(horizontal.w, 100));
      assert.ok(near(horizontal.y, 20 - 17) && near(horizontal.h, 34));
      assert.ok(near(horizontal.radius, 17));

      // Normal along y: the dimensions swap.
      const vertical = bridgeShape(manual(-Math.PI / 2));
      assert.ok(vertical && vertical.kind === 'rect');
      assert.ok(near(vertical.x, 10 - 17) && near(vertical.w, 34));
      assert.ok(near(vertical.y, 20 - 50) && near(vertical.h, 100));

      // Wide plate: the radius is limited to half the smaller side.
      const wide = bridgeShape(manual(0, 20, 200));
      assert.ok(wide && wide.kind === 'rect');
      assert.ok(near(wide.radius, 10));
    });

    test('diagonal is drawn as a stroke with round end caps', () => {
      const s = bridgeShape(manual(Math.PI / 4, 74, 34));
      assert.ok(s && s.kind === 'stroke');
      assert.ok(near(s.width, 34));
      const seg = (74 - 34) / 2 / Math.SQRT2;
      assert.ok(near(s.x1, 10 - seg) && near(s.y1, 20 - seg));
      assert.ok(near(s.x2, 10 + seg) && near(s.y2, 20 + seg));
    });

    test('diagonal in contact (length = width) — a circle, not a skip', () => {
      const s = bridgeShape(manual(Math.PI / 4, 34, 34));
      assert.ok(s && s.kind === 'rect');
      assert.ok(near(s.x, 10 - 17) && near(s.y, 20 - 17));
      assert.ok(near(s.w, 34) && near(s.h, 34) && near(s.radius, 17));
    });

    test('diagonal wider than length: the stroke goes along the seam', () => {
      const s = bridgeShape(manual(Math.PI / 4, 20, 34));
      assert.ok(s && s.kind === 'stroke');
      assert.ok(near(s.width, 20));
      const seg = (34 - 20) / 2;
      const ux = -Math.sin(Math.PI / 4);
      const uy = Math.cos(Math.PI / 4);
      assert.ok(near(s.x1, 10 - ux * seg) && near(s.y1, 20 - uy * seg));
      assert.ok(near(s.x2, 10 + ux * seg) && near(s.y2, 20 + uy * seg));
    });

    test('real bridge at the wall: the plate matches the geometry', () => {
      const [b] = bridges([body(100, 10)], spec);
      const s = bridgeShape(b);
      assert.ok(s && s.kind === 'rect');
      assert.ok(near(s.x + s.w / 2, b.centerX));
      assert.ok(near(s.y + s.h / 2, b.centerY));
      assert.ok(near(s.w, b.width) && near(s.h, b.length));
      assert.ok(near(s.radius, Math.min(b.width, b.length) / 2));
    });
  });
});
