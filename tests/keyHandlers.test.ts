import assert from 'node:assert/strict';
import test from 'node:test';

import { KeyHandlers } from '@lib/windows/keyHandlers';

const key = { keyval: 32, keycode: 65, state: 0 };

test('a registered handler is called', () => {
  const handlers = new KeyHandlers();
  let called = 0;
  handlers.add(() => {
    called += 1;
    return true;
  });

  assert.equal(handlers.dispatch(key), true);
  assert.equal(called, 1);
});

test('handlers run in registration order and stop at the first true', () => {
  const handlers = new KeyHandlers();
  const calls: number[] = [];
  handlers.add(() => {
    calls.push(1);
  });
  handlers.add(() => {
    calls.push(2);
    return true;
  });
  handlers.add(() => {
    calls.push(3);
  });

  assert.equal(handlers.dispatch(key), true);
  assert.deepEqual(calls, [1, 2]);
});

test('the returned function removes only its own handler', () => {
  const handlers = new KeyHandlers();
  const calls: string[] = [];
  const off = handlers.add(() => {
    calls.push('removed');
  });
  handlers.add(() => {
    calls.push('kept');
  });

  off();
  handlers.dispatch(key);

  assert.deepEqual(calls, ['kept']);
  assert.equal(handlers.size, 1);
});

test('removing twice is harmless', () => {
  const handlers = new KeyHandlers();
  const off = handlers.add(() => true);

  off();
  off();

  assert.equal(handlers.size, 0);
});
