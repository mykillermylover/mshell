import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  initial,
  type Peer,
  type PriorityState,
  step,
} from '@lib/players/priority';

const peer = (busName: string, playing = false, available = true): Peer => ({
  busName,
  playing,
  available,
});

/** Один шаг из пустого состояния. */
const once = (peers: Peer[]): PriorityState => step(initial(), peers);

describe('priority', () => {
  describe('выбор приоритета', () => {
    test('1. пустой список — приоритета нет', () => {
      const s = once([]);
      assert.equal(s.primary, null);
      assert.deepEqual(s.started, []);
    });

    test('2. все на паузе — первый по имени', () => {
      assert.equal(once([peer('b'), peer('a')]).primary, 'a');
    });

    test('3. играет один — он', () => {
      assert.equal(once([peer('a'), peer('b', true)]).primary, 'b');
    });

    test('4. играл и встал на паузу — остаётся приоритетным', () => {
      const s1 = once([peer('a'), peer('b', true)]);
      const s2 = step(s1, [peer('a'), peer('b')]);
      assert.equal(s2.primary, 'b');
    });

    test('5. приоритетный на паузе, заиграл другой — другой', () => {
      const s1 = once([peer('a'), peer('b')]);
      assert.equal(s1.primary, 'a');
      const s2 = step(s1, [peer('a'), peer('b', true)]);
      assert.equal(s2.primary, 'b');
    });

    test('6. приоритетный играет, заиграл другой — приоритетный', () => {
      const s1 = once([peer('a', true), peer('b')]);
      const s2 = step(s1, [peer('a', true), peer('b', true)]);
      assert.equal(s2.primary, 'a');
    });
  });

  describe('стек запусков', () => {
    test('7. играют двое, приоритетный встал на паузу — заигравший последним', () => {
      const s1 = once([peer('a', true)]);
      const s2 = step(s1, [peer('a', true), peer('b', true)]); // b заиграл позже
      assert.equal(s2.primary, 'a');
      const s3 = step(s2, [peer('a'), peer('b', true)]);
      assert.equal(s3.primary, 'b');
    });

    test('8. приоритетный исчез — заигравший, иначе первый', () => {
      const s1 = once([peer('a', true)]);
      assert.equal(step(s1, [peer('b', true)]).primary, 'b');
      assert.equal(step(s1, [peer('c'), peer('b')]).primary, 'b');
    });

    test('9. плеер появился играющим — считается заигравшим сейчас', () => {
      const s1 = once([peer('a')]);
      assert.equal(s1.primary, 'a');
      assert.equal(step(s1, [peer('a'), peer('b', true)]).primary, 'b');
    });

    test('10. остановка ведёт себя как пауза', () => {
      const s1 = once([peer('a', true), peer('b')]);
      const s2 = step(s1, [peer('a'), peer('b')]);
      assert.equal(s2.primary, 'a');
    });

    test('11. приоритет вернулся из паузы при играющем другом — остаётся другой, вернувшийся наверху стека', () => {
      const s1 = once([peer('a', true)]);
      const s2 = step(s1, [peer('a', true), peer('b', true)]); // стопка: a, b
      const s3 = step(s2, [peer('a'), peer('b', true)]);
      assert.equal(s3.primary, 'b');
      const s4 = step(s3, [peer('a', true), peer('b', true)]); // a вернулся
      assert.equal(s4.primary, 'b');
      assert.equal(s4.started.at(-1), 'a');
      const s5 = step(s4, [peer('a', true), peer('b')]); // b встал
      assert.equal(s5.primary, 'a');
    });
  });

  describe('инварианты', () => {
    test('12. повторный шаг с тем же входом ничего не меняет', () => {
      const peers = [peer('a', true), peer('b')];
      const s1 = step(initial(), peers);
      const s2 = step(s1, peers);
      assert.deepEqual(s2, s1);
      assert.deepEqual(step(s2, peers), s1);
    });

    test('13. недоступный играющий не выбирается', () => {
      const s = once([peer('a', true, false), peer('b')]);
      assert.equal(s.primary, 'b');
      assert.deepEqual(s.started, []);
    });

    test('14. порядок списка не влияет на результат', () => {
      const s1 = once([peer('a', true)]);
      const fs = step(s1, [peer('a', true), peer('b', true)]);
      const rev = step(s1, [peer('b', true), peer('a', true)]);
      assert.equal(fs.primary, rev.primary);
      assert.deepEqual(fs.started, rev.started);
      assert.deepEqual(fs.playing, rev.playing);
    });

    test('15. все недоступны — приоритета нет', () => {
      assert.equal(once([peer('a', false, false)]).primary, null);
    });
  });
});
