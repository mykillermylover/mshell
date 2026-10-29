import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Debounce, type Scheduler } from '@lib/time/schedule';

/** Fake scheduler: timers fire only when the test advances them. */
const setup = () => {
  const timers = new Map<number, () => void>();
  let nextId = 1;

  const scheduler: Scheduler = {
    after: (ms, run) => {
      const id = nextId++;
      timers.set(id, run);
      return id;
    },
    cancel: (id) => {
      timers.delete(id);
    },
  };

  return {
    scheduler,
    pending: () => timers.size,
    /** Fire every scheduled timer, as the main loop would. */
    flush: () => {
      const due = [...timers.values()];
      timers.clear();
      for (const run of due) {
        run();
      }
    },
  };
};

describe('Debounce', () => {
  describe('scheduling', () => {
    test('debounce: runs once after the delay', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);
      let runs = 0;

      debounce.schedule(() => runs++);
      assert.equal(runs, 0, 'not before the timer fires');
      assert.equal(env.pending(), 1);

      env.flush();
      assert.equal(runs, 1);
      assert.equal(debounce.pending, false);
    });

    test('debounce: a repeated schedule restarts the wait, one run in the end', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);
      const calls: string[] = [];

      debounce.schedule(() => calls.push('first'));
      debounce.schedule(() => calls.push('second'));

      assert.equal(env.pending(), 1, 'the first timer is dropped, not queued');
      env.flush();

      assert.deepEqual(calls, ['second']);
    });

    test('debounce: scheduling from inside the run starts a new wait', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);
      let runs = 0;

      debounce.schedule(() => {
        runs++;
        if (runs === 1) {
          debounce.schedule(() => runs++);
        }
      });

      env.flush();
      assert.equal(runs, 1);
      assert.equal(
        debounce.pending,
        true,
        'the inner schedule survives the run',
      );

      env.flush();
      assert.equal(runs, 2);
    });
  });

  describe('cancel and pending', () => {
    test('debounce: cancel drops the pending run', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);
      let runs = 0;

      debounce.schedule(() => runs++);
      debounce.cancel();

      assert.equal(debounce.pending, false);
      assert.equal(env.pending(), 0);

      env.flush();
      assert.equal(runs, 0);
    });

    test('debounce: cancel without a pending run is a no-op', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);

      debounce.cancel();
      debounce.cancel();

      assert.equal(env.pending(), 0);
    });

    test('debounce: pending is true only while a run is scheduled', () => {
      const env = setup();
      const debounce = new Debounce(500, env.scheduler);

      assert.equal(debounce.pending, false);
      debounce.schedule(() => {});
      assert.equal(debounce.pending, true);
      env.flush();
      assert.equal(debounce.pending, false);
    });
  });
});
