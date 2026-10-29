import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchKey, type KeyEvent } from '@lib/windows/keyHandlers';

const key: KeyEvent = { keyval: 32, keycode: 65, state: 0 };

test('no handlers: the key is not handled', () => {
  assert.equal(dispatchKey([], key), false);
});

test('a handler that returns false lets the key through', () => {
  assert.equal(dispatchKey([() => false], key), false);
});

test('a handler that returns nothing lets the key through', () => {
  assert.equal(dispatchKey([() => {}], key), false);
});

test('true stops the chain: later handlers do not run', () => {
  const calls: string[] = [];

  const handled = dispatchKey(
    [
      () => {
        calls.push('first');
        return true;
      },
      () => {
        calls.push('second');
        return false;
      },
    ],
    key,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ['first'], 'the second handler never runs');
});

test('the first true wins, earlier false handlers still ran', () => {
  const calls: number[] = [];

  const handled = dispatchKey(
    [
      () => {
        calls.push(1);
        return false;
      },
      () => {
        calls.push(2);
        return true;
      },
      () => {
        calls.push(3);
        return true;
      },
    ],
    key,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [1, 2]);
});

test('the key is passed to every handler up to the one that handles it', () => {
  const seen: KeyEvent[] = [];

  dispatchKey(
    [
      (k) => {
        seen.push(k);
        return false;
      },
      (k) => {
        seen.push(k);
        return true;
      },
    ],
    key,
  );

  assert.deepEqual(seen, [key, key]);
});
