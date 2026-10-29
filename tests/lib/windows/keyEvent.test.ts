import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { describeKey, KEYS } from '@lib/windows/keyEvent';

const press = (keyval: number, state = 0) =>
  describeKey({ keyval, keycode: 0, state });

describe('describeKey', () => {
  describe('keys', () => {
    test('the raw keyval is kept as key', () => {
      assert.equal(press(KEYS.space).key, KEYS.space);
    });

    test('named keys are recognised', () => {
      assert.equal(press(KEYS.escape).escape, true);
      assert.equal(press(KEYS.space).space, true);
      assert.equal(press(KEYS.enter).enter, true);
      assert.equal(press(KEYS.tab).tab, true);
      assert.equal(press(KEYS.backspace).backspace, true);
      assert.equal(press(KEYS.delete).delete, true);
      assert.equal(press(KEYS.up).up, true);
      assert.equal(press(KEYS.down).down, true);
      assert.equal(press(KEYS.left).left, true);
      assert.equal(press(KEYS.right).right, true);
      assert.equal(press(KEYS.home).home, true);
      assert.equal(press(KEYS.end).end, true);
      assert.equal(press(KEYS.pageUp).pageUp, true);
      assert.equal(press(KEYS.pageDown).pageDown, true);
      assert.equal(press(KEYS.insert).insert, true);
    });

    test('an unrelated key has every flag off', () => {
      const k = press(KEYS.a);

      assert.equal(k.escape, false);
      assert.equal(k.space, false);
      assert.equal(k.up, false);
      assert.equal(k.f, null);
    });

    test('KP_Enter counts as enter', () => {
      assert.equal(press(KEYS.kpEnter).enter, true);
    });

    test('F-keys report their number, others null', () => {
      assert.equal(press(KEYS.f1).f, 1);
      assert.equal(press(KEYS.f12).f, 12);
      assert.equal(press(KEYS.a).f, null);
    });
  });

  describe('modifiers', () => {
    test('modifiers come from the state mask', () => {
      const k = press(KEYS.a, 1 | 4 | 8);

      assert.equal(k.shift, true);
      assert.equal(k.ctrl, true);
      assert.equal(k.alt, true);
      assert.equal(k.super, false);
    });

    test('a modifier pressed on its own is reported per side', () => {
      assert.equal(press(KEYS.shiftL).shiftLeft, true);
      assert.equal(press(KEYS.shiftR).shiftRight, true);
      assert.equal(press(KEYS.shiftL).shiftRight, false);

      assert.equal(press(KEYS.ctrlL).ctrlLeft, true);
      assert.equal(press(KEYS.ctrlR).ctrlRight, true);

      assert.equal(press(KEYS.altL).altLeft, true);
      assert.equal(press(KEYS.superR).superRight, true);
    });

    test('ctrl held with a letter does not tell the side: only ctrl is set', () => {
      const k = press(KEYS.c, 4);

      assert.equal(k.ctrl, true);
      assert.equal(k.ctrlLeft, false);
      assert.equal(k.ctrlRight, false);
    });

    test('super uses the high bit and is not confused with other masks', () => {
      assert.equal(press(KEYS.a, 67_108_864).super, true);
      assert.equal(press(KEYS.a, 4).super, false);
    });
  });
});
