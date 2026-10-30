import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Rect } from '@lib/geometry';
import { HoverGate } from '@lib/windows/HoverGate';
import { popBody } from '@lib/windows/popLayout';

const STYLE = { border: 4, screenRadius: 10 };
const OPEN_DELAY = 120;
const HIDE_DELAY = 300;

/** A right-edge popover: the lip zone, the content and the frame strip. */
const closed = (): Rect => ({ x: 1250, y: 91, w: 10, h: 658 });
const open = (): Rect => ({ x: 740, y: 91, w: 520, h: 658 });

describe('popHover', () => {
  test('popBody: a right edge drops the frame strip, a top edge drops it too', () => {
    assert.deepEqual(popBody(open(), 'right', STYLE.border), {
      x: 740,
      y: 91,
      w: 516,
      h: 658,
    });
    assert.deepEqual(
      popBody({ x: 0, y: 0, w: 200, h: 100 }, 'top', STYLE.border),
      { x: 0, y: 4, w: 200, h: 96 },
    );
  });

  /**
   * The report: the pointer rests on the frame strip, the popover opens,
   * the strip leaves the input area, the popover closes, the strip is back -
   * and it repeats forever.
   */
  test('a dwell on the frame strip settles open instead of cycling', () => {
    const point = { x: 1258, y: 400 };
    const timers: { ms: number; run: () => void; canceled: boolean }[] = [];
    let shown = false;
    let changes = 0;
    let opened = false;

    const gate = new HoverGate({
      open: () => {
        shown = true;
        opened = true;
        changes++;
      },
      close: () => {
        shown = false;
        changes++;
      },
      isOpen: () => shown,
      schedule: (ms, run) => {
        const timer = { ms, run, canceled: false };
        timers.push(timer);
        return () => {
          timer.canceled = true;
        };
      },
    });

    const advance = (elapsed: number) => {
      for (const timer of timers) {
        if (!timer.canceled) {
          timer.canceled = true;
          timer.run();
        }
      }
      timers.length = 0;

      // The dwell never moves: the same point is probed against the current state.
      // Input is the raw slot, open or closed alike - that is what keeps this stable.
      const input = shown ? open() : closed();
      const inside =
        point.x >= input.x &&
        point.x < input.x + input.w &&
        point.y >= input.y &&
        point.y < input.y + input.h;

      if (inside) {
        gate.enter(OPEN_DELAY);
      } else {
        gate.leave(HIDE_DELAY);
      }

      assert.ok(elapsed >= 0);
    };

    // Five seconds of dwelling, in steps well above both delays.
    for (let step = 0; step < 25; step++) {
      advance(step * 200);
    }

    assert.equal(
      shown,
      true,
      'the popover stays open under the resting cursor',
    );
    assert.equal(opened, true);
    assert.equal(changes, 1, `expected one transition, got ${changes}`);
  });
});
