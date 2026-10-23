import assert from 'node:assert/strict';
import test from 'node:test';

import { easeOutBack } from '@lib/frame/easing';

test('easeOutBack: фиксирует концы и даёт перелёт', () => {
  assert.equal(easeOutBack(0), 0);
  assert.equal(easeOutBack(1), 1);
  assert.ok(easeOutBack(0.8) > 1, 'должен быть перелёт за цель');
});
