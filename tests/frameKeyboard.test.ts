import assert from 'node:assert/strict';
import test from 'node:test';

import { FrameKeyboard, type KeyboardMode } from '@lib/frame/FrameKeyboard';

/** Fake frame: records keymode and focus changes as a call log. */
const setup = () => {
  const calls: string[] = [];

  const keyboard = new FrameKeyboard({
    keymode: (mode: KeyboardMode) => calls.push(`mode:${mode}`),
    focus: (owner: string | null) => calls.push(`focus:${owner ?? '-'}`),
  });

  return { keyboard, calls };
};

test('hover enter: on-demand and focus on that window', () => {
  const env = setup();

  env.keyboard.hover('a', true);

  assert.deepEqual(env.calls, ['mode:on-demand', 'focus:a']);
});

test('hover leave: back to none and unfocus', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.calls.length = 0;
  env.keyboard.hover('a', false);

  assert.deepEqual(env.calls, ['mode:none', 'focus:-']);
});

test('repeated hover enter of the owner: nothing', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.calls.length = 0;
  env.keyboard.hover('a', true);

  assert.deepEqual(env.calls, []);
});

test('hover leave of a window that is not the owner: nothing', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.hover('b', true);
  env.calls.length = 0;
  env.keyboard.hover('a', false);

  assert.deepEqual(env.calls, []);
});

test('hover enter while exclusive is held: ignored', () => {
  const env = setup();

  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.hover('a', true);

  assert.deepEqual(env.calls, []);
});

test('exclusive enter: exclusive and focus on that window', () => {
  const env = setup();

  env.keyboard.exclusive('modal', true);

  assert.deepEqual(env.calls, ['mode:exclusive', 'focus:modal']);
});

test('exclusive leave with a hovered window: on-demand goes back to it', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.exclusive('modal', false);

  assert.deepEqual(env.calls, ['mode:on-demand', 'focus:a']);
});

test('exclusive leave with nobody hovered: none', () => {
  const env = setup();

  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.exclusive('modal', false);

  assert.deepEqual(env.calls, ['mode:none', 'focus:-']);
});

test('exclusive leave by a window that does not hold it: nothing', () => {
  const env = setup();

  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.exclusive('other', false);

  assert.deepEqual(env.calls, []);
});

test('hover leave while exclusive is held: the grab stays', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.hover('a', false);

  assert.deepEqual(env.calls, []);
});

test('unfocus: a window holding both ends at none', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.exclusive('a', true);
  env.calls.length = 0;
  env.keyboard.unfocus('a');

  assert.deepEqual(env.calls, ['mode:none', 'focus:-']);
});

test('unfocus: a hovered window closes its grab, a foreign one is untouched', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.calls.length = 0;
  env.keyboard.unfocus('b');
  assert.deepEqual(env.calls, []);

  env.keyboard.unfocus('a');
  assert.deepEqual(env.calls, ['mode:none', 'focus:-']);
});

test('exclusive leave returns on-demand to the window hovered before the grab', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.hover('b', true);
  env.keyboard.exclusive('modal', true);
  env.calls.length = 0;
  env.keyboard.exclusive('modal', false);

  assert.deepEqual(env.calls, ['mode:on-demand', 'focus:b']);
});

test('owner: the hovered window while only hover holds it', () => {
  const env = setup();

  env.keyboard.hover('a', true);

  assert.equal(env.keyboard.owner, 'a');
  env.keyboard.hover('a', false);
  assert.equal(env.keyboard.owner, null);
});

test('owner: an exclusive grab wins over the hovered window', () => {
  const env = setup();

  env.keyboard.hover('a', true);
  env.keyboard.exclusive('modal', true);
  assert.equal(env.keyboard.owner, 'modal');

  env.keyboard.exclusive('modal', false);
  assert.equal(env.keyboard.owner, 'a', 'hover comes back after the modal');
});

test('owner: nothing when neither hover nor exclusive holds it', () => {
  const env = setup();

  assert.equal(env.keyboard.owner, null);
});
