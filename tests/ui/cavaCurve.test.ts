import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  type CurveOptions,
  curveSegments,
  polylinePoints,
} from '@ui/cavaCurve';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const curve = (
  values: number[],
  options: CurveOptions = {},
  width = 100,
  height = 40,
  pad = 0,
) => curveSegments(values, width, height, pad, options);

describe('cavaCurve', () => {
  describe('curveSegments', () => {
    test('each span is split at its middle: two segments per gap, the width covered', () => {
      const segs = curve([0.5, 0.5, 0.5]);

      assert.equal(segs.length, 4);
      assert.ok(near(segs[0].x1, 0) && near(segs[3].x2, 100));
      assert.ok(near(segs[0].x2, 25), 'the span is split in half');
      assert.ok(
        segs.every((s) => near(s.y1, 20) && near(s.y2, 20)),
        'a flat line stays flat',
      );
    });

    test('a flat line stays flat through the handles', () => {
      for (const s of curve([0.5, 0.5, 0.5])) {
        assert.ok(near(s.cy1, 20) && near(s.cy2, 20));
      }
    });

    test('padding keeps the line off the top and the bottom edges', () => {
      const quiet = curve([0, 0], {}, 100, 40, 5);
      const loud = curve([1, 1], {}, 100, 40, 5);

      assert.ok(quiet.every((s) => near(s.y1, 35) && near(s.y2, 35)));
      assert.ok(loud.every((s) => near(s.y1, 5) && near(s.y2, 5)));
    });

    test('sag bows a span by the mean level of the two points times sag', () => {
      // Levels 1 and 0, mean 0.5 of a 40 px height: the middle sinks by 20 * 0.5.
      const segs = curve([1, 0], { sag: 0.5 });
      const [first] = segs;
      const last = segs.at(-1);

      assert.ok(first && last);
      assert.ok(near(first.y1, 0), 'the left point keeps its level');
      assert.ok(near(last.y2, 40), 'the right point keeps its level');
      assert.ok(near(first.x2, 50) && near(first.y2, 30), 'the middle sinks');
      // The handles lean toward the sunk middle: an edge pulls 1/6 of the bow.
      assert.ok(near(first.cy1, 30 / 6));
    });

    test('sag 0 is a straight span: no bow even between different levels', () => {
      const segs = curve([1, 0], { sag: 0 });

      assert.ok(near(segs[0].y2, 20), 'the middle sits midway, no bow');
      assert.ok(segs.every((s) => near(s.cy1 + s.y1 - s.y1, s.cy1)));
    });

    test('silence does not bow: a span at the bottom stays flat whatever sag is', () => {
      const segs = curve([0, 0], { sag: 5 });

      assert.ok(segs.every((s) => near(s.y1, 40) && near(s.y2, 40)));
    });

    test('louder spans bow more: the bow follows the level of the points', () => {
      // Both maxed: the mean sits at the top, the bow has nowhere to go.
      const loud = curve([1, 1], { sag: 0.5 }, 100, 40);
      // Half level: the mean is 20 px below the top, the bow is its half.
      const middle = curve([0.5, 0.5], { sag: 0.5 }, 100, 40);

      // Full level: the bow is half of the 40 px span; half level: half of that.
      assert.ok(near(loud[0].y2, 0 + 20), 'maxed: sinks half the span');
      assert.ok(near(middle[0].y2, 20 + 10), 'quieter: sinks a quarter');
    });

    test('values are clamped and NaN is treated as silence', () => {
      const segs = curve([5, Number.NaN, -3]);

      assert.ok(near(segs[0].y1, 0));
      assert.ok(near(segs[3].y2, 40));
    });

    test('a single value is a flat line across the width', () => {
      const segs = curve([0.5]);

      assert.equal(segs.length, 2);
      assert.ok(near(segs[0].x1, 0) && near(segs[1].x2, 100));
      assert.ok(segs.every((s) => near(s.y1, 20) && near(s.y2, 20)));
    });

    test('no room: no values or no size yields nothing', () => {
      assert.deepEqual(curve([], {}, 100, 40), []);
      assert.deepEqual(curve([0.5], {}, 0, 40), []);
      assert.deepEqual(curve([0.5], {}, 100, 0), []);
    });
  });

  describe('polylinePoints', () => {
    test('one point per value, spread evenly across the width', () => {
      const pts = polylinePoints([0.5, 0.5, 0.5], 100, 40, 0);

      assert.equal(pts.length, 3);
      assert.ok(near(pts[0].x, 0) && near(pts[1].x, 50) && near(pts[2].x, 100));
      assert.ok(
        pts.every((p) => near(p.y, 20)),
        'flat line at half height',
      );
    });

    test('a single value is centered: a flat polyline needs two ends', () => {
      const pts = polylinePoints([0.5], 100, 40, 0);

      assert.deepEqual(
        pts.map((p) => [p.x, p.y]),
        [
          [0, 20],
          [100, 20],
        ],
      );
    });

    test('padding keeps the line off the top and the bottom edges', () => {
      const quiet = polylinePoints([0], 100, 40, 5);
      const loud = polylinePoints([1], 100, 40, 5);

      assert.ok(quiet.every((p) => near(p.y, 35)));
      assert.ok(loud.every((p) => near(p.y, 5)));
    });

    test('values are clamped and NaN is treated as silence', () => {
      const pts = polylinePoints([5, Number.NaN, -3], 100, 40, 0);

      assert.ok(near(pts[0].y, 0));
      assert.ok(near(pts[1].y, 40));
      assert.ok(near(pts[2].y, 40));
    });

    test('no room: no values or no size yields nothing', () => {
      assert.deepEqual(polylinePoints([], 100, 40, 0), []);
      assert.deepEqual(polylinePoints([0.5], 0, 40, 0), []);
      assert.deepEqual(polylinePoints([0.5], 100, 0, 0), []);
    });
  });
});
