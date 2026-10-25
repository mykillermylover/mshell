import assert from 'node:assert/strict';
import test from 'node:test';

import { HoverGate } from '@lib/windows/HoverGate';

interface Timer {
  ms: number;
  run: () => void;
  canceled: boolean;
}

/** Fake scheduler: time is advanced manually via flush(). */
const setup = () => {
  let open = false;
  const calls: string[] = [];
  const timers: Timer[] = [];

  const gate = new HoverGate({
    open: () => {
      open = true;
      calls.push('open');
    },
    close: () => {
      open = false;
      calls.push('close');
    },
    isOpen: () => open,
    schedule: (ms, run) => {
      const timer = { ms, run, canceled: false };
      timers.push(timer);
      return () => {
        timer.canceled = true;
      };
    },
  });

  return {
    gate,
    calls,
    timers,
    isOpen: () => open,
    setOpen: (value: boolean) => {
      open = value;
    },
    flush: () => {
      for (const timer of timers) {
        if (!timer.canceled) {
          timer.canceled = true;
          timer.run();
        }
      }
    },
  };
};

test('enter: opens after the delay', () => {
  const env = setup();

  env.gate.enter(120);
  assert.deepEqual(env.calls, []);
  assert.equal(env.timers[0].ms, 120);

  env.flush();
  assert.deepEqual(env.calls, ['open']);
});

test('enter → leave before firing: open canceled', () => {
  const env = setup();

  env.gate.enter(120);
  env.gate.leave(300);
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), false);
});

test('leave: closes an open window after the delay', () => {
  const env = setup();
  env.setOpen(true);

  env.gate.leave(300);
  assert.deepEqual(env.calls, []);
  assert.equal(env.timers[0].ms, 300);

  env.flush();
  assert.deepEqual(env.calls, ['close']);
});

test('repeated enter cancels the scheduled close', () => {
  const env = setup();
  env.setOpen(true);

  env.gate.leave(300);
  env.gate.enter(120);
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), true);
});

test('zero delays fire synchronously', () => {
  const env = setup();

  env.gate.enter(0);
  assert.deepEqual(env.calls, ['open']);

  env.gate.leave(0);
  assert.deepEqual(env.calls, ['open', 'close']);
});

test('enter on an open window schedules nothing', () => {
  const env = setup();
  env.setOpen(true);

  env.gate.enter(120);
  env.flush();

  assert.deepEqual(env.calls, []);
});

test('leave on a closed window schedules nothing', () => {
  const env = setup();

  env.gate.leave(300);
  env.flush();

  assert.deepEqual(env.calls, []);
});

test('cancel: removes the scheduled transition', () => {
  const env = setup();

  env.gate.enter(120);
  env.gate.cancel();
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), false);
});
