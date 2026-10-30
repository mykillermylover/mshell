import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { easeOutCubic } from '@lib/frame/easing';
import { type WavePoint, wavePoints } from '@ui/slider/sliderMath';
import { snapStep } from '@ui/slider/sliderStep';

describe('snapStep', () => {
  test('snapStep: rounds to the grid from min', () => {
    assert.equal(snapStep(0.31, 0, 0.5), 0.5);
    assert.equal(snapStep(0.2, 0, 0.5), 0);
    assert.equal(snapStep(0.31, -1, 0.5), 0.5);
    assert.equal(snapStep(-0.2, -1, 0.5), 0);
    assert.equal(snapStep(2.24, 0.1, 0.1), 2.2);
    assert.equal(snapStep(7, 0, 1), 7);
  });

  test('snapStep: without a step the value is untouched', () => {
    assert.equal(snapStep(2.24, 0, 0), 2.24);
    assert.equal(snapStep(Number.NaN, 0, 0.1), Number.NaN);
  });
});

describe('wavePoints', () => {
  test('wavePoints: amplitude 0 draws a flat line of two points', () => {
    const out: WavePoint[] = [];
    const n = wavePoints(out, 10, 50, 20, 0, 0, 15, 2);

    assert.equal(n, 2);
    assert.deepEqual(out[0], { x: 10, y: 20 });
    assert.deepEqual(out[1], { x: 50, y: 20 });
  });

  test('wavePoints: a sine of the requested amplitude and wavelength', () => {
    const out: WavePoint[] = [];
    // 3.75 px steps land exactly on the crests of a 15 px wavelength.
    const n = wavePoints(out, 0, 30, 20, 2, 0, 15, 3.75);
    const ys = out.slice(0, n).map((p) => p.y);

    // x = 0 is a node, x = 3.75 a crest, x = 7.5 a node, x = 11.25 a trough.
    assert.ok(Math.abs(ys[0] - 20) < 1e-9);
    assert.ok(Math.abs(Math.max(...ys) - 22) < 1e-9);
    assert.ok(Math.abs(Math.min(...ys) - 18) < 1e-9);
    assert.equal(out.slice(0, n).at(-1)?.x, 30);
    assert.equal(n, 9);
  });

  test('wavePoints: the phase moves the wave without moving the window', () => {
    const out: WavePoint[] = [];
    const n = wavePoints(out, 0, 15, 20, 2, 15, 15, 3.75);
    // A whole wavelength of shift leaves every point where it was.
    assert.ok(Math.abs((out[0]?.y ?? 0) - 20) < 1e-9);
    assert.ok(Math.abs((out[1]?.y ?? 0) - 22) < 1e-9);
    assert.equal(out[n - 1]?.x, 15);
  });
});

describe('easeOutCubic', () => {
  test('easeOutCubic: pinned at both ends, fast at the start', () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    // Front-loaded: half the distance is covered well before half the time.
    assert.ok(easeOutCubic(0.5) > 0.8);
  });

  test('easeOutCubic: monotonic', () => {
    for (let t = 0; t < 1; t += 0.1) {
      assert.ok(easeOutCubic(t + 0.1) > easeOutCubic(t));
    }
  });
});
