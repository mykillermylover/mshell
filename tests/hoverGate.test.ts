import assert from 'node:assert/strict';
import test from 'node:test';

import { HoverGate } from '@lib/windows/hoverGate';

interface Timer {
  ms: number;
  run: () => void;
  canceled: boolean;
}

/** Фейковый планировщик: время двигаем вручную через flush(). */
const setup = () => {
  let open = false;
  let pinned = false;
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
    isPinned: () => pinned,
    setPinned: (value) => {
      pinned = value;
    },
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
    isPinned: () => pinned,
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

test('enter: открывает после задержки', () => {
  const env = setup();

  env.gate.enter(120);
  assert.deepEqual(env.calls, []);
  assert.equal(env.timers[0].ms, 120);

  env.flush();
  assert.deepEqual(env.calls, ['open']);
});

test('enter → leave до срабатывания: открытие отменено', () => {
  const env = setup();

  env.gate.enter(120);
  env.gate.leave(300);
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), false);
});

test('leave: закрывает открытое окно после задержки', () => {
  const env = setup();
  env.setOpen(true);

  env.gate.leave(300);
  assert.deepEqual(env.calls, []);
  assert.equal(env.timers[0].ms, 300);

  env.flush();
  assert.deepEqual(env.calls, ['close']);
});

test('повторный enter отменяет запланированное закрытие', () => {
  const env = setup();
  env.setOpen(true);

  env.gate.leave(300);
  env.gate.enter(120);
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), true);
});

test('нулевые задержки срабатывают синхронно', () => {
  const env = setup();

  env.gate.enter(0);
  assert.deepEqual(env.calls, ['open']);

  env.gate.leave(0);
  assert.deepEqual(env.calls, ['open', 'close']);
});

test('pin: открывает и не даёт leave закрыть окно', () => {
  const env = setup();

  env.gate.pin();
  assert.equal(env.isOpen(), true);
  assert.equal(env.isPinned(), true);

  env.gate.leave(300);
  env.flush();

  assert.deepEqual(env.calls, ['open']);
  assert.equal(env.isOpen(), true);
});

test('pin отменяет уже запланированное закрытие', () => {
  const env = setup();
  env.setOpen(true);
  env.gate.leave(300);

  env.gate.pin();
  env.flush();

  assert.deepEqual(env.calls, ['open']);
  assert.equal(env.isOpen(), true);
});

test('unpin: следующий leave снова закрывает', () => {
  const env = setup();

  env.gate.pin();
  env.gate.unpin();
  env.gate.leave(300);
  env.flush();

  assert.deepEqual(env.calls, ['open', 'close']);
  assert.equal(env.isOpen(), false);
});

test('cancel: снимает запланированный переход', () => {
  const env = setup();

  env.gate.enter(120);
  env.gate.cancel();
  env.flush();

  assert.deepEqual(env.calls, []);
  assert.equal(env.isOpen(), false);
});
