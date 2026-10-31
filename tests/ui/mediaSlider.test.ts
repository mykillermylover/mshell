import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type TrackBoxes, trackLayout } from '@ui/slider/trackLayout';
import { WaveStage } from '@ui/slider/waveStage';

const boxes: TrackBoxes = {
  // Trough from x=12 to 1692, 2 px tall, centered at y=689.
  trough: { x: 12, y: 688, width: 1680, height: 2 },
  // The thin highlight: it gives the track's thickness, not its length.
  fill: { x: 12, y: 688, width: 672, height: 2 },
  handle: { x: 676, y: 681, width: 16, height: 16 },
};

/** The track layout for a value on a 0..100 scale. */
const layoutAt = (value: number) =>
  trackLayout(boxes, { value, min: 0, max: 100 });

describe('trackLayout', () => {
  test('trackLayout: the track runs along the trough', () => {
    const layout = layoutAt(0);

    assert.equal(layout.centerY, 689);
    assert.equal(layout.activeStart, 12);
    assert.equal(layout.trackEnd, 1692);
  });

  test('trackLayout: the fill comes from the value, not from GTK', () => {
    // Whole pixels would quantize; the fraction survives.
    assert.equal(layoutAt(40).activeEnd, 12 + 1680 * 0.4);
    assert.equal(layoutAt(12.5).activeEnd, 12 + 1680 * 0.125);
  });

  test('trackLayout: the value is clamped to the track', () => {
    assert.equal(layoutAt(-10).activeEnd, 12);
    assert.equal(layoutAt(150).activeEnd, 1692);
  });

  test('trackLayout: a degenerate range parks the fill at the start', () => {
    const layout = trackLayout(boxes, { value: 5, min: 0, max: 0 });

    assert.equal(layout.activeEnd, 12);
  });

  test('trackLayout: the thickness comes from the fill, the handle is taller', () => {
    const layout = layoutAt(0);

    assert.equal(layout.thickness, 2);
    assert.equal(layout.handleHeight, 16);
  });
});

describe('WaveStage', () => {
  test('WaveStage: starts flat and at rest', () => {
    const stage = new WaveStage();

    assert.equal(stage.frame.level, 0);
    assert.equal(stage.atRest, true);
  });

  test('WaveStage: retarget to waving rises to full level', () => {
    const stage = new WaveStage(6, 1.6);

    stage.retarget(1);
    stage.restartClock();

    let now = 1_000_000;
    let frame = stage.tick(now, true);

    // First frame only opens the interval.
    assert.equal(frame.level, 0);

    now += 1_000_000; // one second: well past any tween duration
    frame = stage.tick(now, true);

    assert.equal(frame.level, 1);
    assert.equal(frame.alive, true);
    assert.equal(stage.atRest, false);
  });

  test('WaveStage: the crests move against the progress', () => {
    const stage = new WaveStage(10, 1.6);

    stage.retarget(1);
    stage.restartClock();

    let now = 1_000_000;
    stage.tick(now, true);
    now += 1_000_000;
    const first = stage.tick(now, true).phase;
    now += 1_000_000;
    const second = stage.tick(now, true).phase;

    // The phase drifts backwards, and JS `%` keeps the sign, so it lives in
    // (-15, 0] and jumps when it wraps. Compare modulo one wavelength: a
    // forward drift would give WAVE_LENGTH - speed*dt instead.
    const drift = (((first - second) % 15) + 15) % 15;

    assert.equal(drift, 10);
  });

  test('WaveStage: flattening keeps ticking until it lands, then rests', () => {
    const stage = new WaveStage(6, 1.6);

    stage.retarget(1);
    stage.restartClock();

    let now = 1_000_000;
    stage.tick(now, true);
    now += 1_000_000;
    stage.tick(now, true);

    // Pause: the amplitude eases out even though the crests stop. The first
    // frame opens the tween, the second one lands it - exactly how a real
    // frame clock hands the ticks over.
    stage.retarget(0);
    now += 16_000;
    stage.tick(now, false);
    now += 200_000;
    const mid = stage.tick(now, false);

    assert.equal(mid.level, 0);
    assert.equal(mid.alive, false);
    assert.equal(stage.atRest, true);
  });

  test('WaveStage: retargeting mid-tween resumes from the current level', () => {
    const stage = new WaveStage(6, 1.6);

    stage.retarget(1);
    stage.restartClock();

    let now = 1_000_000;
    stage.tick(now, true);
    now += 45_000; // 30 % into the 150 ms flatten
    const half = stage.tick(now, true).level;

    assert.ok(half > 0 && half < 1);

    stage.retarget(0);
    now += 45_000;
    const back = stage.tick(now, false);

    // It cannot have jumped: the drop is at most the distance it climbed.
    assert.ok(back.level <= half);
    assert.ok(back.level >= 0);
  });
});
