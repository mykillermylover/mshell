import assert from 'node:assert/strict';
import test from 'node:test';

import { snapStep } from '@widgets/Slider';

test('snapStep: округляет к сетке от min', () => {
  assert.equal(snapStep(0.31, 0, 0.5), 0.5);
  assert.equal(snapStep(0.2, 0, 0.5), 0);
  assert.equal(snapStep(0.31, -1, 0.5), 0.5);
  assert.equal(snapStep(-0.2, -1, 0.5), 0);
  assert.equal(snapStep(2.24, 0.1, 0.1), 2.2);
  assert.equal(snapStep(7, 0, 1), 7);
});

test('snapStep: без шага значение не трогается', () => {
  assert.equal(snapStep(2.24, 0, 0), 2.24);
  assert.equal(snapStep(Number.NaN, 0, 0.1), Number.NaN);
});
