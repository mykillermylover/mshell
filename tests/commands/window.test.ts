import assert from 'node:assert/strict';
import test from 'node:test';

import type { MonitorFrames } from '@lib/commands/registry';
import type { CommandFrame, WindowCommand } from '@lib/commands/window';
import { windowDomain } from '@lib/commands/window';

interface FakeFrame extends CommandFrame {
  readonly connector: string;
  log: string[];
}

const frame = (connector: string, ids: string[]): FakeFrame => {
  const log: string[] = [];

  return {
    connector,
    log,
    has: (id) => ids.includes(id),
    toggle: (id) => log.push(`toggle:${id}`),
    open: (id) => log.push(`open:${id}`),
    close: (id) => log.push(`close:${id}`),
    closeAll: () => log.push('closeall'),
  };
};

const monitorFrames = (
  list: FakeFrame[],
  focused?: FakeFrame,
): MonitorFrames<FakeFrame> => ({
  byConnector: (name) => list.find((item) => item.connector === name),
  all: () => list,
  focused: () => focused ?? list[0],
});

const commands = (target: MonitorFrames<FakeFrame>) =>
  windowDomain(target).commands;
const call = (
  table: ReturnType<typeof commands>,
  action: WindowCommand,
  monitor: string | undefined,
  args: string[],
) => table[action].run({ monitor, args });

test('window: toggle, open and close reach the addressed window', () => {
  const left = frame('eDP-1', ['settings']);
  const table = commands(monitorFrames([left]));

  assert.deepEqual(call(table, 'toggle', undefined, ['settings']), {
    kind: 'ok',
  });
  assert.deepEqual(call(table, 'open', undefined, ['settings']), {
    kind: 'ok',
  });
  assert.deepEqual(call(table, 'close', undefined, ['settings']), {
    kind: 'ok',
  });

  assert.deepEqual(left.log, [
    'toggle:settings',
    'open:settings',
    'close:settings',
  ]);
});

test('window: an unknown window is a reply, nothing is called', () => {
  const left = frame('eDP-1', ['settings']);
  const table = commands(monitorFrames([left]));

  assert.deepEqual(call(table, 'toggle', undefined, ['nope']), {
    kind: 'unknown-window',
    id: 'nope',
  });
  assert.deepEqual(call(table, 'toggle', undefined, []), {
    kind: 'unknown-window',
    id: '',
  });
  assert.deepEqual(left.log, []);
});

test('window: --monitor addresses that frame', () => {
  const left = frame('eDP-1', ['settings']);
  const right = frame('DP-3', ['settings']);
  const table = commands(monitorFrames([left, right], left));

  assert.deepEqual(call(table, 'toggle', 'DP-3', ['settings']), { kind: 'ok' });

  assert.deepEqual(right.log, ['toggle:settings']);
  assert.deepEqual(left.log, []);
});

test('window: without --monitor the focused frame answers', () => {
  const left = frame('eDP-1', ['settings']);
  const right = frame('DP-3', ['settings']);
  const table = commands(monitorFrames([left, right], right));

  assert.deepEqual(call(table, 'close', undefined, ['settings']), {
    kind: 'ok',
  });

  assert.deepEqual(right.log, ['close:settings']);
  assert.deepEqual(left.log, []);
});

test('window: an unknown monitor is not silently the focused one', () => {
  const left = frame('eDP-1', ['settings']);
  const table = commands(monitorFrames([left], left));

  assert.deepEqual(call(table, 'close', 'HDMI-9', ['settings']), {
    kind: 'no-frame',
  });
  assert.deepEqual(left.log, []);
});

test('window: closeall without a monitor hits every frame', () => {
  const left = frame('eDP-1', ['settings']);
  const right = frame('DP-3', ['settings']);
  const table = commands(monitorFrames([left, right]));

  assert.deepEqual(call(table, 'closeall', undefined, []), { kind: 'ok' });

  assert.deepEqual(left.log, ['closeall']);
  assert.deepEqual(right.log, ['closeall']);
});

test('window: closeall with a monitor hits only that frame', () => {
  const left = frame('eDP-1', ['settings']);
  const right = frame('DP-3', ['settings']);
  const table = commands(monitorFrames([left, right], left));

  assert.deepEqual(call(table, 'closeall', 'DP-3', []), { kind: 'ok' });

  assert.deepEqual(right.log, ['closeall']);
  assert.deepEqual(left.log, []);
});

test('window: no frames at all is reported, closeall still succeeds', () => {
  const table = commands(monitorFrames([]));

  assert.deepEqual(call(table, 'toggle', undefined, ['settings']), {
    kind: 'no-frame',
  });
  assert.deepEqual(call(table, 'closeall', undefined, []), { kind: 'ok' });
});

test('window: the table covers exactly the declared commands', () => {
  assert.deepEqual(Object.keys(commands(monitorFrames([]))).sort(), [
    'close',
    'closeall',
    'open',
    'toggle',
  ]);
});

test('window: every command and the domain itself are documented', () => {
  const domain = windowDomain(monitorFrames([]));

  assert.ok(domain.help.length > 0);
  for (const [name, command] of Object.entries(domain.commands)) {
    assert.ok(command.help.length > 0, `${name} has no help`);
  }
});
