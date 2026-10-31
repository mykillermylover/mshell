import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyReading,
  DEFAULT_HORIZON,
  extrapolate,
  type Extrapolation,
  inferredRate,
  MAX_INFER_GAP_MS,
} from '@lib/time/extrapolate';

/** An estimate that starts at `value` with a known speed. */
const estimate = (
  value: number,
  rate: number,
  at = 0,
  horizon = 1_000,
): Extrapolation => ({ value, rate, at, horizon });

describe('extrapolate', () => {
  test('at the moment of the reading the value is the reported one', () => {
    assert.equal(extrapolate(estimate(42, 1), 0), 42);
  });

  test('without a rate the value stays put', () => {
    assert.equal(extrapolate(estimate(42, 0), 5000), 42);
  });

  test('a rate advances the value one unit per second', () => {
    assert.equal(extrapolate(estimate(10, 1), 1000), 11);
    assert.equal(extrapolate(estimate(10, 1), 500), 10.5);
    // A 2 s horizon, so 1.5 s of travel is allowed.
    assert.equal(extrapolate(estimate(10, 2, 0, 2000), 1500), 13);
  });

  test('a negative rate runs the value backwards', () => {
    assert.equal(extrapolate(estimate(10, -1, 0, 2000), 2000), 8);
  });

  test('elapsed time is measured from the reading, not from zero', () => {
    assert.equal(extrapolate(estimate(100, 1, 5000, 5000), 10_000), 105);
  });
});

describe('inferredRate', () => {
  test('the first report cannot infer anything', () => {
    assert.equal(inferredRate(null, 10, 0), null);
  });

  test('two reports a second apart imply one unit per second', () => {
    assert.equal(inferredRate(estimate(10, 0), 11, 1000), 1);
  });

  test('a slower cadence still gives the same speed', () => {
    // 2 units gained over 500 ms is 4 per second.
    assert.equal(inferredRate(estimate(10, 0), 12, 500), 4);
  });

  test('a value going backwards is a seek, not a speed', () => {
    assert.equal(inferredRate(estimate(100, 0), 20, 1000), null);
  });

  test('a gap too long to be playback is not a speed', () => {
    assert.equal(inferredRate(estimate(10, 0), 11, MAX_INFER_GAP_MS + 1), null);
  });

  test('no time passed means no speed', () => {
    assert.equal(inferredRate(estimate(10, 0), 11, 0), null);
  });
});

describe('applyReading', () => {
  test('an explicit rate wins over the inferred one', () => {
    const next = applyReading(estimate(10, 1), { value: 30, rate: 5 }, 1000);

    assert.deepEqual(next, { value: 30, rate: 5, at: 1000, horizon: 1000 });
  });

  test('without a rate the speed comes from the two reports', () => {
    const next = applyReading(estimate(10, 0), { value: 12 }, 2000);

    assert.deepEqual(next, { value: 12, rate: 1, at: 2000, horizon: 2000 });
  });

  test('a seek backwards keeps the speed instead of stopping', () => {
    const next = applyReading(estimate(100, 2), { value: 20 }, 1000);

    // The jump itself is meaningless, but the track is still playing.
    assert.deepEqual(next, { value: 20, rate: 2, at: 1000, horizon: 1000 });
  });

  test('the very first report starts at rest', () => {
    assert.deepEqual(applyReading(null, { value: 7 }, 500), {
      value: 7,
      rate: 0,
      at: 500,
      horizon: DEFAULT_HORIZON,
    });
  });

  test('the horizon becomes the observed interval', () => {
    const next = applyReading(estimate(10, 1, 0), { value: 11 }, 1_000);

    assert.deepEqual(next, { value: 11, rate: 1, at: 1_000, horizon: 1_000 });
  });

  test('a long gap does not become the horizon', () => {
    // Reports resumed after a long silence: the gap is not the cadence.
    const next = applyReading(
      estimate(10, 1, 0, 1_000),
      { value: 30 },
      MAX_INFER_GAP_MS + 1,
    );

    assert.equal(next.horizon, 1_000);
  });
});
