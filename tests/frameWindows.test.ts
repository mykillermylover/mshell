import assert from 'node:assert/strict';
import test from 'node:test';

import type { Rect } from '@lib/field/geometry';
import { FrameWindows, type Measured } from '@lib/frame/FrameWindows';

const noop = () => {};

interface Body extends Measured {
  readonly id: string;
  shape: { body: Rect | null; input: Rect | null };
  disposed: boolean;
  applied: number;
}

/** The registry measures through this; in a frame it is the field. */
const makeRegistry = () => new FrameWindows<Body>((item) => item.shape);

/** A body that reports the rects it was told to report. */
const body = (
  id: string,
  state: { body: Rect | null; input: Rect | null },
): Body => ({
  id,
  shape: state,
  disposed: false,
  applied: 0,
  subscribe: () => noop,
  dispose() {
    this.disposed = true;
  },
  apply() {
    this.applied++;
  },
});

const rect = (x: number, w = 100): Rect => ({ x, y: 0, w, h: 50 });

test('registry: bodies keep the order they were added in', () => {
  const reg = makeRegistry();
  reg.add(body('a', { body: rect(1), input: rect(1) }));
  reg.add(body('b', { body: rect(2), input: rect(2) }));

  assert.deepEqual(
    reg.bodies().map((item) => item.id),
    ['a', 'b'],
  );
});

test('registry: a duplicate id is rejected', () => {
  const reg = makeRegistry();
  reg.add(body('a', { body: rect(1), input: rect(1) }));

  assert.throws(
    () => reg.add(body('a', { body: rect(1), input: rect(1) })),
    /duplicate window id: a/,
  );
});

test('registry: measure gives one rect per visible body, in order', () => {
  const reg = makeRegistry();
  reg.add(body('a', { body: rect(1), input: rect(1) }));
  reg.add(body('b', { body: rect(2), input: rect(2) }));

  assert.deepEqual(reg.measure().rects, [rect(1), rect(2)]);
  assert.deepEqual(reg.measure().inputs, [rect(1), rect(2)]);
});

/**
 * The closed popover: no body to draw, but the lip and the frame strip must
 * still take input - that input is what opens it.
 */
test('registry: a body-less window contributes input but no shape', () => {
  const reg = makeRegistry();
  reg.add(body('closed', { body: null, input: rect(9) }));

  assert.deepEqual(reg.measure().rects, []);
  assert.deepEqual(reg.measure().inputs, [rect(9)]);
});

test('registry: a removed window leaves both lists and is disposed', () => {
  const reg = makeRegistry();
  const first = body('a', { body: rect(1), input: rect(1) });
  reg.add(first);
  reg.add(body('b', { body: rect(2), input: rect(2) }));

  assert.equal(reg.remove('a'), true);

  assert.deepEqual(reg.measure().rects, [rect(2)]);
  assert.equal(first.disposed, true);
  assert.equal(reg.has('a'), false);
});

test('registry: removing an unknown id changes nothing', () => {
  const reg = makeRegistry();
  reg.add(body('a', { body: rect(1), input: rect(1) }));

  assert.equal(reg.remove('missing'), false);
  assert.deepEqual(reg.measure().rects, [rect(1)]);
});

test('registry: subscribers are dropped with their window', () => {
  const reg = makeRegistry();
  let subscriptions = 0;
  const first = body('a', { body: rect(1), input: rect(1) });
  first.subscribe = () => {
    subscriptions++;
    return () => {
      subscriptions--;
    };
  };

  reg.add(first);
  assert.equal(subscriptions, 1);

  reg.remove('a');
  assert.equal(subscriptions, 0);
});

test('registry: apply and dispose reach every window', () => {
  const reg = makeRegistry();
  const first = body('a', { body: rect(1), input: rect(1) });
  const second = body('b', { body: rect(2), input: rect(2) });
  reg.add(first);
  reg.add(second);

  reg.apply();
  assert.equal(first.applied, 1);
  assert.equal(second.applied, 1);

  reg.dispose();
  assert.equal(first.disposed, true);
  assert.equal(second.disposed, true);
});
