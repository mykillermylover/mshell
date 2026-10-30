import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BREAK_WIDTH,
  CENTER_GAP,
  type SliderMode,
  type TrackBoxes,
  trackLayout,
} from '@ui/slider/m3Layout';

/**
 * A trough of 1000 px with a 16 px handle: the handle's center travels from
 * 8 to 992, so the track spans 8..992.
 */
const boxesAt = (handleX: number): TrackBoxes => ({
  trough: { x: 0, y: 0, width: 1000, height: 2 },
  fill: { x: 0, y: 0, width: handleX, height: 2 },
  handle: { x: handleX - 8, y: 0, width: 16, height: 16 },
});

// The drawn track runs a cap radius past the travel ends on both sides; the
// dots sit exactly on those ends. Measured, GtkRange moves the handle's center
// over `trough.x + 1 .. right - 1`.
const TRAVEL_START = 1;
const TRAVEL_END = 999;
const TRACK_START = TRAVEL_START - 8;
const TRACK_END = TRAVEL_END + 8;

/**
 * `value` is what places the handle now; the fixture maps 0..100 onto the
 * trough so a call site can think in percentages.
 */
/** Compare spans with a pixel of tolerance: the edges land on fractions. */
const near = (actual: number[][], expected: number[][]) => {
  assert.equal(actual.length, expected.length);

  for (const [i, [from, to]] of actual.entries()) {
    assert.ok(Math.abs(from - expected[i][0]) < 1);
    assert.ok(Math.abs(to - expected[i][1]) < 1);
  }
};

const layoutAt = (
  handleX: number,
  mode: SliderMode = 'standard',
  options: { pressed?: boolean; stopIndicators?: boolean } = {},
) =>
  trackLayout(boxesAt(handleX), {
    mode,
    pressed: options.pressed ?? false,
    stopIndicators: options.stopIndicators ?? true,
    value: handleX,
    min: 0,
    max: 1000,
  });

describe('trackLayout: standard', () => {
  test('the fill runs from the track start to the break', () => {
    const { segments, handleX } = layoutAt(400);
    const active = segments.find((segment) => segment.active);

    assert.ok(Math.abs((active?.from ?? 0) - TRACK_START) < 1);
    assert.ok(Math.abs((active?.to ?? 0) - (handleX - BREAK_WIDTH / 2)) < 1);
  });

  test('the track ahead starts after the break and ends at the track end', () => {
    const { segments, handleX } = layoutAt(400);
    const inactive = segments.find((segment) => !segment.active);

    assert.ok(
      Math.abs((inactive?.from ?? 0) - (handleX + BREAK_WIDTH / 2)) < 1,
    );
    assert.ok(Math.abs((inactive?.to ?? 0) - TRACK_END) < 1);
  });

  test('a stop sits under the handle center at each extreme', () => {
    const layout = layoutAt(400);

    // The dots are exactly where GtkRange parks the handle's center.
    assert.equal(layout.stopStartX, TRAVEL_START);
    assert.equal(layout.stopEndX, TRAVEL_END);

    // And the drawn track reaches past both, so they sit inside a body.
    assert.ok(layout.trackStart < layout.stopStartX);
    assert.ok(layout.trackEnd > layout.stopEndX);
  });

  test('the break has the same width at rest and while pressed', () => {
    const rest = layoutAt(400, 'standard', { pressed: false });
    const pressed = layoutAt(400, 'standard', { pressed: true });

    const restGap =
      [rest.segments].flat().find((segment) => !segment.active)!.from -
      rest.segments.find((s) => s.active)!.to;
    const pressedGap =
      [pressed.segments].flat().find((segment) => !segment.active)!.from -
      pressed.segments.find((s) => s.active)!.to;

    assert.equal(restGap, BREAK_WIDTH);
    assert.equal(pressedGap, BREAK_WIDTH);
  });

  test('pressing thins the handle to 2 px without moving the break', () => {
    assert.equal(layoutAt(400).handleWidth, 4);
    assert.equal(layoutAt(400, 'standard', { pressed: true }).handleWidth, 2);
  });

  test('only the far end gets a stop indicator', () => {
    const layout = layoutAt(400);

    assert.equal(layout.stopAtStart, false);
    assert.equal(layout.stopAtEnd, true);
  });

  test('no stop indicators when they are turned off', () => {
    const layout = layoutAt(400, 'standard', { stopIndicators: false });

    assert.equal(layout.stopAtStart, false);
    assert.equal(layout.stopAtEnd, false);
  });
});

describe('trackLayout: centered', () => {
  test('a handle left of center fills from the handle to the center seam', () => {
    const { segments } = layoutAt(250, 'centered');
    const active = segments.find((segment) => segment.active);

    assert.ok(Math.abs(active?.from - 259) < 1, `expected ~259`, active?.from);
    assert.ok(Math.abs(active?.to - 495) < 1, `expected ~495`, active?.to);
  });

  test('a handle right of center fills from the center seam to the handle', () => {
    const { segments } = layoutAt(750, 'centered');
    const active = segments.find((segment) => segment.active);

    assert.ok(Math.abs(active?.from - 505) < 1, `expected ~505`, active?.from);
    assert.ok(Math.abs(active?.to - 742) < 1, `expected ~742`, active?.to);
  });

  test('the unfilled track is the half the handle is not on', () => {
    // Handle on the left: the left stub is empty, the right half is empty.
    const left = layoutAt(250, 'centered')
      .segments.filter((s) => !s.active)
      .map(({ from, to }) => [from, to]);

    near(left, [
      [TRACK_START, 242.5],
      [505, TRACK_END],
    ]);

    // Handle on the right: the left half is empty, the right stub is empty.
    const right = layoutAt(750, 'centered')
      .segments.filter((s) => !s.active)
      .map(({ from, to }) => [from, to]);

    near(right, [
      [TRACK_START, 495],
      [757.5, TRACK_END],
    ]);
  });

  test('both far ends carry a stop indicator', () => {
    // Two sections, two real ends - the left one is not the center.
    assert.equal(layoutAt(250, 'centered').stopAtStart, true);
    assert.equal(layoutAt(250, 'centered').stopAtEnd, true);
  });
});

describe('trackLayout: centered on the center', () => {
  test('a handle exactly at the center keeps the break on both sides', () => {
    const { segments } = layoutAt(500, 'centered');

    // No filled piece: the value is at the center, nothing has been traveled.
    assert.equal(segments.filter((s) => s.active).length, 0);

    // At the center the break (16 px) is wider than the center seam (10 px),
    // so the break wins and the two halves stop on its edges.
    const [left, right] = segments;
    assert.equal(left.to, 500 - BREAK_WIDTH / 2);
    assert.equal(right.from, 500 + BREAK_WIDTH / 2);
  });
});

describe('trackLayout: the break near the center', () => {
  test('approaching the center never closes the break', () => {
    // Every position from a hair left of the center to a hair right of it.
    for (let handleX = 490; handleX <= 510; handleX++) {
      const { segments } = layoutAt(handleX, 'centered');
      const span = segments.reduce((sum, s) => sum + (s.to - s.from), 0);

      // Near the center the break and the center seam overlap, so the painted
      // length is the track minus their union - never less than the track
      // minus both, and never more than the track minus the break alone.
      const trackLength = TRACK_END - TRACK_START;
      const max = trackLength - BREAK_WIDTH;
      const min = trackLength - BREAK_WIDTH - 2 * CENTER_GAP;

      assert.ok(
        span <= max && span >= min,
        `handle at ${handleX} painted ${span} px, expected ${min}..${max}`,
      );
    }
  });

  test('the break itself is never painted over', () => {
    for (let handleX = 490; handleX <= 510; handleX++) {
      const layout = layoutAt(handleX, 'centered');
      // The break is centered on where the handle actually lands, which is
      // derived from the value - a pixel off the requested handleX.
      const gap = [
        layout.handleX - BREAK_WIDTH / 2,
        layout.handleX + BREAK_WIDTH / 2,
      ];

      for (const segment of layout.segments) {
        assert.ok(
          segment.to <= gap[0] + 0.001 || segment.from >= gap[1] - 0.001,
          `segment ${segment.from}..${segment.to} covers the break at ${handleX}`,
        );
      }
    }
  });
});
