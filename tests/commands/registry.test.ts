import assert from 'node:assert/strict';
import test from 'node:test';

import { Registry } from '@lib/commands/registry';
import type { Reply } from '@lib/commands/reply';

const ok = (): Reply => ({ kind: 'ok' });

const registry = () => new Registry();

test('registry: dispatch goes to the domain table', () => {
  const list = registry();
  const seen: Array<{ monitor: string | undefined; args: string[] }> = [];

  list.register('window', {
    help: 'windows',
    commands: {
      close: {
        help: 'close a window',
        run: ({ monitor, args }) => {
          seen.push({ monitor, args });
          return ok();
        },
      },
    },
  });

  assert.deepEqual(list.run(['window', 'close', 'settings']), { kind: 'ok' });
  assert.deepEqual(seen, [{ monitor: undefined, args: ['settings'] }]);
});

test('registry: --monitor reaches the command', () => {
  const list = registry();
  let monitor: string | undefined;

  list.register('window', {
    help: 'windows',
    commands: {
      close: {
        help: 'close a window',
        run: (ctx) => {
          monitor = ctx.monitor;
          return ok();
        },
      },
    },
  });

  list.run(['window', 'close', '--monitor', 'DP-3']);

  assert.equal(monitor, 'DP-3');
});

test('registry: an unknown domain is a reply', () => {
  const list = registry();
  list.register('window', { help: 'windows', commands: { close: cmd() } });

  assert.deepEqual(list.run(['player', 'next']), {
    kind: 'unknown-command',
    name: 'player',
  });
});

test('registry: an unknown action names both parts', () => {
  const list = registry();
  list.register('window', { help: 'windows', commands: { close: cmd() } });

  assert.deepEqual(list.run(['window', 'nope']), {
    kind: 'unknown-command',
    name: 'window nope',
  });
});

test('registry: a bare domain prints a command list with help', () => {
  const list = registry();
  list.register('window', {
    help: 'Windows of the frame',
    commands: {
      close: cmd('close a window'),
      open: cmd('open a window'),
      toggle: cmd('toggle a window'),
    },
  });

  assert.deepEqual(list.run(['window']), {
    kind: 'text',
    text: [
      'Windows of the frame',
      '  close   close a window',
      '  open    open a window',
      '  toggle  toggle a window',
    ].join('\n'),
  });
});

test('registry: an empty argv prints the domains with help', () => {
  const list = registry();
  list.register('window', { help: 'Windows of the frame', commands: {} });
  list.register('player', { help: 'Media player', commands: {} });

  assert.deepEqual(list.run([]), {
    kind: 'text',
    text: ['  player  Media player', '  window  Windows of the frame'].join(
      '\n',
    ),
  });
});

test('registry: a flag error never reaches a command', () => {
  const list = registry();
  let called = false;

  list.register('window', {
    help: 'windows',
    commands: {
      close: {
        help: 'close',
        run: () => {
          called = true;
          return ok();
        },
      },
    },
  });

  assert.deepEqual(list.run(['window', 'close', '--monitor']), {
    kind: 'bad-argument',
    text: '--monitor needs a value',
  });
  assert.equal(called, false);
});

test('registry: an async command is awaited by the caller', async () => {
  const list = registry();
  list.register('brightness', {
    help: 'Screen brightness',
    commands: {
      up: {
        help: 'raise the brightness',
        run: async () => {
          await Promise.resolve();
          return { kind: 'text', text: 'bright' } as Reply;
        },
      },
    },
  });

  const reply = await list.run(['brightness', 'up']);

  assert.deepEqual(reply, { kind: 'text', text: 'bright' });
});

test('registry: registering a domain twice replaces it', () => {
  const list = registry();
  list.register('window', {
    help: 'windows',
    commands: { close: cmd('old') },
  });
  list.register('window', {
    help: 'windows',
    commands: { close: cmd('new') },
  });

  assert.deepEqual(list.run(['window', 'close']), {
    kind: 'text',
    text: 'new',
  });
});

test('registry: a domain does not see another domain commands', () => {
  const list = registry();
  list.register('window', { help: 'windows', commands: { close: cmd() } });
  list.register('player', { help: 'player', commands: { next: cmd() } });

  assert.deepEqual(list.run(['player', 'close']), {
    kind: 'unknown-command',
    name: 'player close',
  });
});

/** A command that answers with its own help: makes the wiring visible. */
function cmd(help = 'help'): { help: string; run: () => Reply } {
  return { help, run: () => ({ kind: 'text', text: help }) };
}
