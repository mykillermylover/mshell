// Geometry of the wavy track: pure numbers, no GTK, so they are testable in
// node. trackPainter feeds the result into a Gsk path.
//
// The wave lives in the active part of the track ONLY: the phase is a function
// of x, never of the value, so a tap that moves the value only moves the right
// edge of the fill - the crests stay where they are and keep running.

import type { Point } from '@lib/geometry';

/**
 * Sine along the track: `y = cy + A·sin(2π(x − phase) / wavelength)`.
 *
 * `out` gets the points; the caller owns the array to avoid a per-frame
 * allocation. Returns `out` sliced to the number of points written.
 */
export function wavePoints(
  out: Point[],
  fromX: number,
  toX: number,
  cy: number,
  amplitude: number,
  phase: number,
  wavelength: number,
  step: number,
): number {
  const length = toX - fromX;

  // A flat line needs no sampling, and step <= 0 would make `count` infinite.
  if (amplitude === 0 || wavelength <= 0 || !(step > 0)) {
    write(out, 0, fromX, cy);
    write(out, 1, toX, cy);

    return 2;
  }

  const count = Math.max(0, Math.ceil(length / step));
  const k = (2 * Math.PI) / wavelength;

  for (let i = 0; i <= count; i++) {
    const x = fromX + (length * i) / Math.max(1, count);

    write(out, i, x, cy + amplitude * Math.sin(k * (x - phase)));
  }

  return count + 1;
}

/**
 * Write one point in place. The caller reuses one array across frames, so the
 * points are mutated instead of replaced - a 1600 px track at 60 fps would
 * otherwise churn ~50k short-lived objects per second.
 */
function write(out: Point[], index: number, x: number, y: number) {
  const point = out[index];

  if (point) {
    point.x = x;
    point.y = y;
    return;
  }

  out[index] = { x, y };
}

/**
 * How fast the crests travel, px per second. One wavelength (15 px) per
 * second is the M3 figure; lower is calmer.
 */
export const WAVE_SPEED = 6;
/** Distance between crests, px - the M3 expressive figure. */
export const WAVE_LENGTH = 15;
/** Peak displacement, px. */
export const WAVE_AMPLITUDE = 1.6;
/** How long the wave takes to flatten or come back, ms. */
export const FLATTEN_DURATION = 150;

/**
 * How far the pointer must travel before a press counts as a drag, px. GTK's
 * own GestureDrag has no threshold - drag-begin fires on the press - so the
 * tap-vs-drag line has to be drawn here.
 */
export const DRAG_THRESHOLD = 3;
