import assert from 'node:assert/strict';
import test from 'node:test';

import { popLayout } from '@lib/windows/popLayout';

const style = { border: 4, screenRadius: 10 };

test('popLayout: верхний край по центру, без hover', () => {
  assert.deepEqual(popLayout('top', 'center', style, 6, false), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'start',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 4,
      marginBottom: 0,
    },
    children: ['revealer', 'zone'],
    spacer: { widthRequest: -1, heightRequest: 0 },
    zone: { widthRequest: -1, heightRequest: 6 },
  });
});

test('popLayout: нижний край по центру, без hover', () => {
  assert.deepEqual(popLayout('bottom', 'center', style, 6, false), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'end',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 4,
    },
    children: ['zone', 'revealer'],
    spacer: { widthRequest: -1, heightRequest: 0 },
    zone: { widthRequest: -1, heightRequest: 6 },
  });
});

test('popLayout: левый и правый край по центру, без hover', () => {
  assert.deepEqual(popLayout('left', 'center', style, 6, false), {
    orientation: 'horizontal',
    anchor: {
      halign: 'start',
      valign: 'center',
      marginStart: 4,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['revealer', 'zone'],
    spacer: { widthRequest: 0, heightRequest: -1 },
    zone: { widthRequest: 6, heightRequest: -1 },
  });

  assert.deepEqual(popLayout('right', 'center', style, 6, false), {
    orientation: 'horizontal',
    anchor: {
      halign: 'end',
      valign: 'center',
      marginStart: 0,
      marginEnd: 4,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['zone', 'revealer'],
    spacer: { widthRequest: 0, heightRequest: -1 },
    zone: { widthRequest: 6, heightRequest: -1 },
  });
});

test('popLayout: start/end дают отступ от угла, без hover', () => {
  assert.equal(
    popLayout('top', 'start', style, 6, false).anchor.marginStart,
    14,
  );
  assert.equal(popLayout('top', 'end', style, 6, false).anchor.marginEnd, 14);
  assert.equal(
    popLayout('left', 'start', style, 6, false).anchor.marginTop,
    14,
  );
  assert.equal(
    popLayout('left', 'end', style, 6, false).anchor.marginBottom,
    14,
  );
  assert.equal(
    popLayout('bottom', 'start', style, 6, false).anchor.marginStart,
    14,
  );
  assert.equal(
    popLayout('bottom', 'end', style, 6, false).anchor.marginEnd,
    14,
  );
  assert.equal(
    popLayout('right', 'start', style, 6, false).anchor.marginTop,
    14,
  );
  assert.equal(
    popLayout('right', 'end', style, 6, false).anchor.marginBottom,
    14,
  );
});

test('popLayout: hover убирает frame-side margin и добавляет spacer', () => {
  assert.deepEqual(popLayout('top', 'center', style, 6, true), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'start',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['spacer', 'revealer', 'zone'],
    spacer: { widthRequest: -1, heightRequest: 4 },
    zone: { widthRequest: -1, heightRequest: 6 },
  });

  assert.deepEqual(popLayout('bottom', 'center', style, 6, true), {
    orientation: 'vertical',
    anchor: {
      halign: 'center',
      valign: 'end',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['zone', 'revealer', 'spacer'],
    spacer: { widthRequest: -1, heightRequest: 4 },
    zone: { widthRequest: -1, heightRequest: 6 },
  });

  assert.deepEqual(popLayout('left', 'center', style, 6, true), {
    orientation: 'horizontal',
    anchor: {
      halign: 'start',
      valign: 'center',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['spacer', 'revealer', 'zone'],
    spacer: { widthRequest: 4, heightRequest: -1 },
    zone: { widthRequest: 6, heightRequest: -1 },
  });

  assert.deepEqual(popLayout('right', 'center', style, 6, true), {
    orientation: 'horizontal',
    anchor: {
      halign: 'end',
      valign: 'center',
      marginStart: 0,
      marginEnd: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    children: ['zone', 'revealer', 'spacer'],
    spacer: { widthRequest: 4, heightRequest: -1 },
    zone: { widthRequest: 6, heightRequest: -1 },
  });
});

test('popLayout: hover, align start/end не трогает frame-side margin', () => {
  const top = popLayout('top', 'start', style, 6, true);
  assert.equal(top.anchor.marginStart, 14);
  assert.equal(top.anchor.marginTop, 0);
});

test('popLayout: offset сдвигает вдоль края, знак — вправо/вниз', () => {
  const topRight = popLayout('top', 'center', style, 6, false, 40);
  assert.equal(topRight.anchor.marginStart, 80);
  assert.equal(topRight.anchor.marginEnd, 0);

  const topLeft = popLayout('top', 'center', style, 6, false, -40);
  assert.equal(topLeft.anchor.marginStart, 0);
  assert.equal(topLeft.anchor.marginEnd, 80);

  const leftDown = popLayout('left', 'center', style, 6, false, 30);
  assert.equal(leftDown.anchor.marginTop, 60);
  assert.equal(leftDown.anchor.marginBottom, 0);

  const leftUp = popLayout('left', 'center', style, 6, false, -30);
  assert.equal(leftUp.anchor.marginTop, 0);
  assert.equal(leftUp.anchor.marginBottom, 60);
});

test('popLayout: offset у start/end сдвигает внутрь и упирается в кромку', () => {
  assert.equal(
    popLayout('top', 'start', style, 6, false, 40).anchor.marginStart,
    54,
  );
  assert.equal(
    popLayout('top', 'start', style, 6, false, -40).anchor.marginStart,
    0,
  );
  assert.equal(
    popLayout('top', 'end', style, 6, false, -40).anchor.marginEnd,
    54,
  );
  assert.equal(
    popLayout('top', 'end', style, 6, false, 40).anchor.marginEnd,
    0,
  );
  assert.equal(
    popLayout('left', 'start', style, 6, false, 40).anchor.marginTop,
    54,
  );
  assert.equal(
    popLayout('right', 'end', style, 6, false, -40).anchor.marginBottom,
    54,
  );
});
