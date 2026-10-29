import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { anchorPoint, anchorRect, plotSize } from '@ui/cavaAnchor';

// Shape frame: `along` runs with the values, `y` runs from the top of the
// shape (0 = loud, across = silence).

describe('cavaAnchor', () => {
  describe('anchorPoint', () => {
    test('bottom: zero below, values left to right', () => {
      // Silence: at the bottom edge. Loud: at the top edge.
      assert.deepEqual(anchorPoint('bottom', 0, 40, 100, 40), { x: 0, y: 40 });
      assert.deepEqual(anchorPoint('bottom', 100, 0, 100, 40), {
        x: 100,
        y: 0,
      });
    });

    test('top: zero above, values right to left', () => {
      assert.deepEqual(anchorPoint('top', 0, 40, 100, 40), { x: 100, y: 0 });
      assert.deepEqual(anchorPoint('top', 100, 0, 100, 40), { x: 0, y: 40 });
    });

    test('left: zero at the left, values top to bottom', () => {
      // Vertical: along runs down the widget (0..height), across is the width
      // (0..width). Silence (y = width) on the left edge, loud (y 0) on the right.
      assert.deepEqual(anchorPoint('left', 0, 100, 100, 40), { x: 0, y: 0 });
      assert.deepEqual(anchorPoint('left', 40, 0, 100, 40), { x: 100, y: 40 });
    });

    test('right: zero at the right, values bottom to top', () => {
      // Silence (y = width) on the right edge, loud (y 0) on the left one; the
      // values are read from the bottom of the widget up.
      assert.deepEqual(anchorPoint('right', 0, 100, 100, 40), {
        x: 100,
        y: 40,
      });
      assert.deepEqual(anchorPoint('right', 40, 0, 100, 40), { x: 0, y: 0 });
    });

    test('silence sits on the zero edge for every anchor', () => {
      // Silence is y = across: 40 for horizontal anchors, 100 for vertical ones.
      assert.deepEqual(anchorPoint('bottom', 0, 40, 100, 40), { x: 0, y: 40 });
      assert.deepEqual(anchorPoint('top', 0, 40, 100, 40), { x: 100, y: 0 });
      assert.deepEqual(anchorPoint('left', 0, 100, 100, 40), { x: 0, y: 0 });
      assert.deepEqual(anchorPoint('right', 0, 100, 100, 40), {
        x: 100,
        y: 40,
      });
    });
  });

  describe('plotSize', () => {
    test('plot size swaps the axes for a vertical anchor', () => {
      assert.deepEqual(plotSize('bottom', 100, 40), { along: 100, across: 40 });
      assert.deepEqual(plotSize('top', 100, 40), { along: 100, across: 40 });
      assert.deepEqual(plotSize('left', 100, 40), { along: 40, across: 100 });
      assert.deepEqual(plotSize('right', 100, 40), { along: 40, across: 100 });
    });
  });

  describe('anchorRect', () => {
    test('bottom leaves a rect alone', () => {
      const bar = { x: 10, y: 30, w: 4, h: 10 };

      assert.deepEqual(anchorRect('bottom', bar, 100, 40), bar);
    });

    test('top turns the rect: values reverse, the level flips', () => {
      const bar = { x: 10, y: 30, w: 4, h: 10 };

      // x: 100 - 10 - 4; y: 40 - 30 - 10.
      assert.deepEqual(anchorRect('top', bar, 100, 40), {
        x: 86,
        y: 0,
        w: 4,
        h: 10,
      });
    });

    test('vertical anchors turn the rect: w and h swap', () => {
      const bar = { x: 10, y: 30, w: 4, h: 10 };

      // left: x is the level axis from the left edge, y runs down with the values.
      assert.deepEqual(anchorRect('left', bar, 100, 40), {
        x: 60,
        y: 10,
        w: 10,
        h: 4,
      });
      // right: y counts back from the bottom.
      assert.deepEqual(anchorRect('right', bar, 100, 40), {
        x: 30,
        y: 26,
        w: 10,
        h: 4,
      });
    });

    test('no rect leaves the widget for any anchor', () => {
      const bar = { x: 2, y: 20, w: 3, h: 20 };

      for (const anchor of ['bottom', 'top', 'left', 'right'] as const) {
        const r = anchorRect(anchor, bar, 100, 40);

        assert.ok(r.x >= 0 && r.x + r.w <= 100, `${anchor} x`);
        assert.ok(r.y >= 0 && r.y + r.h <= 40, `${anchor} y`);
      }
    });
  });
});
