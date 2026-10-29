import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  dispatchKey,
  type KeyEvent,
  KeyHandlers,
} from '@lib/windows/keyHandlers';

const key: KeyEvent = { keyval: 32, keycode: 65, state: 0 };

describe('keyHandlers', () => {
  describe('dispatchKey', () => {
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
  });

  describe('KeyHandlers', () => {
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
  });
});
