import assert from 'node:assert/strict';
import test from 'node:test';

import { debugDomain } from '@lib/commands/debug';
import type { MonitorFrames } from '@lib/commands/registry';
import { Registry } from '@lib/commands/registry';

interface FakeFrame {
  readonly connector: string;
}

const fakeFrame = (connector: string): FakeFrame => ({ connector });

const monitorFrames = (
  list: FakeFrame[],
  focused?: FakeFrame,
): MonitorFrames<FakeFrame> => ({
  byConnector: (name) => list.find((item) => item.connector === name),
  all: () => list,
  focused: () => focused ?? list[0],
});

/** Records what the debug handler was asked, returns its canned answer. */
const handler = (answer?: string) => {
  const calls: Array<{ frame: FakeFrame; argv: string[] }> = [];

  return {
    calls,
    handle: (frame: FakeFrame, argv: string[]) => {
      calls.push({ frame, argv });
      return answer;
    },
  };
};

test('debug: the action reaches the handler with the command name kept', () => {
  const left = fakeFrame('eDP-1');
  const spy = handler('ok');
  const table = debugDomain(monitorFrames([left]), spy.handle).commands;

  const reply = table.rects.run({ monitor: undefined, args: [] });

  assert.deepEqual(reply, { kind: 'text', text: 'ok' });
  // handleDebug reads argv[1], argv[2] - the name must stay first.
  assert.deepEqual(spy.calls, [{ frame: left, argv: ['rects'] }]);
});

test('debug: arguments follow the command name', () => {
  const left = fakeFrame('eDP-1');
  const spy = handler('ok');
  const table = debugDomain(monitorFrames([left]), spy.handle).commands;

  table.place.run({ monitor: undefined, args: ['player', 'top', '20'] });

  assert.deepEqual(spy.calls[0].argv, ['place', 'player', 'top', '20']);
});

test('debug: --monitor picks the frame', () => {
  const left = fakeFrame('eDP-1');
  const right = fakeFrame('DP-3');
  const spy = handler('ok');
  const table = debugDomain(
    monitorFrames([left, right], left),
    spy.handle,
  ).commands;

  table.rects.run({ monitor: 'DP-3', args: [] });

  assert.equal(spy.calls[0].frame, right);
});

test('debug: an unknown monitor is no-frame, the handler is not called', () => {
  const left = fakeFrame('eDP-1');
  const spy = handler('ok');
  const table = debugDomain(monitorFrames([left]), spy.handle).commands;

  assert.deepEqual(table.rects.run({ monitor: 'HDMI-9', args: [] }), {
    kind: 'no-frame',
  });
  assert.deepEqual(spy.calls, []);
});

test('debug: no frames at all is no-frame', () => {
  const spy = handler('ok');
  const table = debugDomain(monitorFrames([]), spy.handle).commands;

  assert.deepEqual(table.rects.run({ monitor: undefined, args: [] }), {
    kind: 'no-frame',
  });
});

test('debug: a handler that does not know the command says so', () => {
  const left = fakeFrame('eDP-1');
  const spy = handler();
  const table = debugDomain(monitorFrames([left]), spy.handle).commands;

  assert.deepEqual(table.rects.run({ monitor: undefined, args: [] }), {
    kind: 'unknown-command',
    name: 'debug rects',
  });
});

test('debug: every command and the domain itself are documented', () => {
  const spy = handler();
  const domain = debugDomain(monitorFrames([]), spy.handle);

  assert.ok(domain.help.length > 0);
  for (const [name, command] of Object.entries(domain.commands)) {
    assert.ok(command.help.length > 0, `${name} has no help`);
  }
});

test('debug: under the registry the domain answers by name', () => {
  const left = fakeFrame('eDP-1');
  const spy = handler('42');
  const list = new Registry({
    debug: debugDomain(monitorFrames([left]), spy.handle),
  });

  assert.deepEqual(list.run(['debug', 'frames']), {
    kind: 'text',
    text: '42',
  });
  assert.deepEqual(list.run(['debug', 'nope']), {
    kind: 'unknown-command',
    name: 'debug nope',
  });
});
