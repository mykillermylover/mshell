import assert from 'node:assert/strict';
import test from 'node:test';

import { polylinePoints } from '@ui/cavaCurve';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('one point per value, spread evenly across the width', () => {
  const pts = polylinePoints([0.5, 0.5, 0.5], 100, 40, 0);

  assert.equal(pts.length, 3);
  assert.ok(near(pts[0].x, 0) && near(pts[1].x, 50) && near(pts[2].x, 100));
  assert.ok(
    pts.every((p) => near(p.y, 20)),
    'flat line at half height',
  );
});

test('a single value is centered: a flat polyline needs two ends', () => {
  const pts = polylinePoints([0.5], 100, 40, 0);

  assert.deepEqual(
    pts.map((p) => [p.x, p.y]),
    [
      [0, 20],
      [100, 20],
    ],
  );
});

test('padding keeps the line off the top and the bottom edges', () => {
  const quiet = polylinePoints([0], 100, 40, 5);
  const loud = polylinePoints([1], 100, 40, 5);

  assert.ok(quiet.every((p) => near(p.y, 35)));
  assert.ok(loud.every((p) => near(p.y, 5)));
});

test('values are clamped and NaN is treated as silence', () => {
  const pts = polylinePoints([5, Number.NaN, -3], 100, 40, 0);

  assert.ok(near(pts[0].y, 0));
  assert.ok(near(pts[1].y, 40));
  assert.ok(near(pts[2].y, 40));
});

test('no room: no values or no size yields nothing', () => {
  assert.deepEqual(polylinePoints([], 100, 40, 0), []);
  assert.deepEqual(polylinePoints([0.5], 0, 40, 0), []);
  assert.deepEqual(polylinePoints([0.5], 100, 0, 0), []);
});
