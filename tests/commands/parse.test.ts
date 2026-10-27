import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from '@lib/commands/parse';

const parsed = (argv: string[]) => {
  const result = parse(argv);
  assert.ok(
    'parsed' in result,
    `expected a parse, got ${JSON.stringify(result)}`,
  );
  return result.parsed;
};

const failure = (argv: string[]) => {
  const result = parse(argv);
  assert.ok(
    'error' in result,
    `expected an error, got ${JSON.stringify(result)}`,
  );
  return result.error;
};

test('parse: domain, action and args', () => {
  assert.deepEqual(parsed(['window', 'close', 'settings']), {
    monitor: undefined,
    domain: 'window',
    action: 'close',
    args: ['settings'],
  });
});

test('parse: a bare domain has no action', () => {
  assert.deepEqual(parsed(['window']), {
    monitor: undefined,
    domain: 'window',
    action: undefined,
    args: [],
  });
});

test('parse: an empty argv has no domain either', () => {
  assert.deepEqual(parsed([]), {
    monitor: undefined,
    domain: '',
    action: undefined,
    args: [],
  });
});

test('parse: --monitor takes a value and leaves the rest alone', () => {
  assert.deepEqual(
    parsed(['--monitor', 'DP-3', 'window', 'close', 'settings']),
    {
      monitor: 'DP-3',
      domain: 'window',
      action: 'close',
      args: ['settings'],
    },
  );
});

test('parse: --monitor=<value> is the same', () => {
  assert.deepEqual(parsed(['window', 'close', '--monitor=DP-3']), {
    monitor: 'DP-3',
    domain: 'window',
    action: 'close',
    args: [],
  });
});

test('parse: the flag may stand anywhere', () => {
  const middle = parsed(['window', '--monitor', 'DP-3', 'close', 'settings']);

  assert.deepEqual(middle, {
    monitor: 'DP-3',
    domain: 'window',
    action: 'close',
    args: ['settings'],
  });
});

test('parse: the last --monitor wins', () => {
  assert.equal(
    parsed(['--monitor', 'a', '--monitor=b', 'window', 'close']).monitor,
    'b',
  );
});

test('parse: a flag without a value is an argument error', () => {
  assert.deepEqual(failure(['window', 'close', '--monitor']), {
    kind: 'bad-argument',
    text: '--monitor needs a value',
  });
});

test('parse: an empty --monitor= is an argument error', () => {
  assert.deepEqual(failure(['--monitor=', 'window']), {
    kind: 'bad-argument',
    text: '--monitor needs a value',
  });
});

test('parse: an unknown flag stays an ordinary argument', () => {
  assert.deepEqual(parsed(['window', 'close', '--force']).args, ['--force']);
});
