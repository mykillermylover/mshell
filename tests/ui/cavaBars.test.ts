import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { barRects } from '@ui/cavaBars';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('cavaBars', () => {
  describe('geometry', () => {
    test('bars split the width evenly, one gap centered between neighbours', () => {
      const rects = barRects([0.5, 0.5, 0.5, 0.5], 100, 40, 2);

      assert.equal(rects.length, 4);
      assert.ok(near(rects[0].x, 1), 'gap/2 from the left edge');
      assert.ok(near(rects[1].x, 26), 'slot + gap/2');
      assert.ok(near(rects[3].x, 76));
      assert.ok(
        rects.every((r) => near(r.w, 23)),
        'width = slot - gap',
      );
      assert.ok(
        rects.every((r) => near(r.h, 20)),
        'half height',
      );
      assert.ok(
        rects.every((r) => near(r.y, 20)),
        'bars grow from the bottom',
      );
    });
  });

  describe('levels', () => {
    test('values are clamped: overshoot to the full height, silence to zero', () => {
      const [loud] = barRects([1.4], 30, 50, 0);

      assert.ok(loud);
      assert.ok(near(loud.h, 50) && near(loud.y, 0));
    });

    test('silence keeps a visible floor: every bar stays at min height', () => {
      const rects = barRects([0, -0.2, Number.NaN, 0.5], 40, 50, 0, 2);

      assert.equal(rects.length, 4, 'silent bars are drawn, not dropped');
      for (const r of rects.slice(0, 3)) {
        assert.ok(near(r.h, 2), 'silent: min height');
        assert.ok(near(r.y, 48), 'resting on the bottom');
      }
      assert.ok(near(rects[3].h, 25), 'a loud bar is unaffected');
    });

    test('the floor never exceeds the height of a loud bar', () => {
      const [quiet, loud] = barRects([0, 1], 30, 3, 0, 10);

      assert.ok(quiet && loud);
      assert.ok(quiet.h <= 3 && loud.h <= 3);
    });

    test('no floor by default: silence still draws nothing', () => {
      assert.equal(barRects([0, 0], 40, 50, 0).length, 0);
    });
  });

  describe('no room', () => {
    test('no room: empty values, zero width, or a gap wider than a slot', () => {
      assert.deepEqual(barRects([], 100, 50, 2), []);
      assert.deepEqual(barRects([0.5], 0, 50, 2), []);
      assert.deepEqual(barRects([0.5], 100, 0, 2), []);
      assert.deepEqual(barRects([0.5, 0.5], 3, 50, 10), []);
    });
  });
});
