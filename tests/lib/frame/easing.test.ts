import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { easeOutBack } from '@lib/frame/easing';

describe('easeOutBack', () => {
  test('easeOutBack: fixes the ends and produces overshoot', () => {
    assert.equal(easeOutBack(0), 0);
    assert.equal(easeOutBack(1), 1);
    assert.ok(easeOutBack(0.8) > 1, 'must overshoot the target');
  });
});
