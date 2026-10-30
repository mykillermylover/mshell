import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CHASE_DURATION, ValueTween } from '@ui/slider/valueTween';

/** A tween over a 0..100 range: a full jump takes CHASE_DURATION. */
const tween100 = (value = 0) => new ValueTween(value, 100);

/** One frame `ms` after `from`, both in µs. */
const frame = (tween: ValueTween, from: number, ms: number) =>
  tween.step(from + ms * 1000);

describe('ValueTween', () => {
  test('starts at rest on the value it was given', () => {
    const tween = tween100(50);

    assert.equal(tween.value, 50);
    assert.equal(tween.atRest, true);
  });

  test('a retarget is not applied until the clock moves', () => {
    const tween = tween100(0);

    tween.retarget(100);

    assert.equal(tween.value, 0);
    assert.equal(tween.atRest, false);
  });

  test('the first step only opens the interval', () => {
    const tween = tween100(0);

    tween.retarget(100);
    tween.step(1_000_000);

    assert.equal(tween.value, 0);
  });

  test('a full-range jump lands exactly in CHASE_DURATION', () => {
    const tween = tween100(0);

    tween.retarget(100);
    tween.step(0);

    // Half the time: half the distance - the chase is constant speed.
    const half = CHASE_DURATION * 500;
    frame(tween, 0, CHASE_DURATION / 2);
    assert.equal(Math.round(tween.value), 50);

    frame(tween, half, CHASE_DURATION / 2);
    assert.equal(tween.value, 100);
    assert.equal(tween.atRest, true);
  });

  test('never overshoots the target', () => {
    const tween = tween100(0);

    tween.retarget(10);
    tween.step(0);
    frame(tween, 0, 10_000);

    assert.equal(tween.value, 10);
  });

  test('a continuously retargeted drag keeps moving', () => {
    const tween = tween100(0);

    // What a drag does: a new target every frame, always a little further.
    let time = 0;
    tween.step(time);

    for (let i = 1; i <= 10; i++) {
      tween.retarget(i * 5);
      time += 16_000;
      tween.step(time);
    }

    // It must have traveled: restarting the clock on each retarget would
    // leave it frozen at the start.
    assert.ok(tween.value > 0, `value=${tween.value}`);
  });

  test('retargeting mid-flight turns around without jumping', () => {
    const tween = tween100(0);

    tween.retarget(100);
    tween.step(0);
    frame(tween, 0, CHASE_DURATION / 2);

    const mid = tween.value;
    assert.ok(mid > 0 && mid < 100);

    tween.retarget(0);
    frame(tween, CHASE_DURATION * 500, CHASE_DURATION / 4);

    assert.ok(tween.value < mid, `value=${tween.value} mid=${mid}`);
    assert.ok(tween.value >= 0);
  });

  test('the rate follows the span, not the numbers', () => {
    // A 0..1 slider covers its whole range in the same time as a 0..100 one.
    const unit = new ValueTween(0, 1);

    unit.retarget(1);
    unit.step(0);
    frame(unit, 0, CHASE_DURATION / 2);

    assert.equal(Math.round(unit.value * 100) / 100, 0.5);
  });
});
