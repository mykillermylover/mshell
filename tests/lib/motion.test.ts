import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cubicBezier,
  DURATION,
  EASING,
  easingEmphasizedAccelerate,
  easingEmphasizedDecelerate,
  easingFor,
  resolveDuration,
  resolveEasing,
} from '@lib/motion';

describe('cubicBezier', () => {
  test('pinned at both ends', () => {
    const f = cubicBezier(0.2, 0, 0, 1);

    assert.equal(f(0), 0);
    assert.equal(f(1), 1);
  });

  test('progress outside [0, 1] is clamped', () => {
    const f = cubicBezier(0.2, 0, 0, 1);

    assert.equal(f(-0.5), 0);
    assert.equal(f(1.5), 1);
  });

  test('(0, 0, 1, 1) is the identity', () => {
    const f = cubicBezier(0, 0, 1, 1);

    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      assert.ok(Math.abs(f(t) - t) < 1e-3, `f(${t}) = ${f(t)}`);
    }
  });

  test('M3 curves are monotonic', () => {
    for (const f of [easingEmphasizedDecelerate, easingEmphasizedAccelerate]) {
      let prev = f(0);

      for (let i = 1; i <= 100; i++) {
        const value = f(i / 100);

        assert.ok(value >= prev - 1e-9, `not monotonic at ${i / 100}`);
        prev = value;
      }
    }
  });

  test('decelerate is front-loaded, like the curve it replaces', () => {
    assert.ok(easingEmphasizedDecelerate(0.5) > 0.5);
  });

  test('accelerate is back-loaded', () => {
    assert.ok(easingEmphasizedAccelerate(0.5) < 0.5);
  });
});

describe('easingFor', () => {
  test('growing decelerates, shrinking accelerates', () => {
    assert.equal(easingFor(0, 1), easingEmphasizedDecelerate);
    assert.equal(easingFor(1, 0), easingEmphasizedAccelerate);
  });
});

describe('DURATION', () => {
  test('holds the whole md-sys-motion scale', () => {
    // The CSS side has all sixteen; the two must not drift apart.
    assert.equal(Object.keys(DURATION).length, 16);
  });

  test('values match md-sys-motion', () => {
    assert.deepEqual(
      [
        DURATION.short1,
        DURATION.short3,
        DURATION.medium4,
        DURATION.long4,
        DURATION.extraLong4,
      ],
      [50, 150, 400, 600, 1000],
    );
  });
});

describe('EASING', () => {
  test('holds the whole md-sys-motion set', () => {
    assert.equal(Object.keys(EASING).length, 10);
  });

  test('wires the directional names to the right curves', () => {
    assert.equal(EASING.emphasizedDecelerate, easingEmphasizedDecelerate);
    assert.equal(EASING.emphasizedAccelerate, easingEmphasizedAccelerate);
  });

  test('every curve is pinned at both ends', () => {
    for (const [name, f] of Object.entries(EASING)) {
      assert.equal(f(0), 0, name);
      assert.equal(f(1), 1, name);
    }
  });
});

describe('resolveDuration', () => {
  test('a token name becomes milliseconds', () => {
    assert.equal(resolveDuration('medium2'), 300);
  });

  test('a number passes through', () => {
    assert.equal(resolveDuration(123), 123);
  });

  test('undefined stays undefined, so a widget keeps its own default', () => {
    assert.equal(resolveDuration(), undefined);
  });
});

/** A curve of the caller's own, to prove functions are not wrapped. */
const own = (t: number) => t * t;

describe('resolveEasing', () => {
  test('a name becomes the function', () => {
    assert.equal(resolveEasing('linear'), EASING.linear);
  });

  test('a function passes through', () => {
    assert.equal(resolveEasing(own), own);
  });
});
