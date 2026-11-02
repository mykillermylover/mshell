import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FocusRing,
  RING_ACTIVE_WIDTH,
  RING_WIDTH,
  ringWidthAt,
} from '../../src/ui/slider/focusRing';

describe('focus ring geometry', () => {
  test('начинается с нуля и выпрыгивает до активной ширины', () => {
    assert.equal(ringWidthAt(0), 0);
    assert.equal(ringWidthAt(150), RING_ACTIVE_WIDTH);
  });

  test('оседает обратно до 3px и остаётся там', () => {
    assert.equal(ringWidthAt(150 + 450), RING_WIDTH);
    assert.equal(ringWidthAt(10_000), RING_WIDTH);
  });

  test('растёт монотонно на обеих фазах', () => {
    let previous = -1;

    for (let t = 0; t <= 150; t += 10) {
      const width = ringWidthAt(t);

      assert.ok(width >= previous, `grow не монотонен на ${t}ms`);
      previous = width;
    }

    previous = Infinity;

    for (let t = 150; t <= 600; t += 10) {
      const width = ringWidthAt(t);

      assert.ok(width <= previous, `settle не монотонен на ${t}ms`);
      previous = width;
    }
  });
});

describe('focus ring state', () => {
  test('скрытая рамка не рисуется и не просит кадров', () => {
    const ring = new FocusRing();

    assert.equal(ring.width, 0);
    assert.equal(ring.atRest, true);
  });

  test('показ запускает анимацию с нуля', () => {
    const ring = new FocusRing();

    ring.setVisible(true);

    assert.equal(ring.width, 0);
    assert.equal(ring.atRest, false);
  });

  test('тик двигает анимацию по часам кадра', () => {
    const ring = new FocusRing();

    ring.setVisible(true);
    ring.tick(1_000_000); // первый кадр только открывает интервал
    assert.equal(ring.width, 0);

    ring.tick(1_150_000); // +150ms: пик
    assert.equal(ring.width, RING_ACTIVE_WIDTH);

    ring.tick(1_600_000); // +450ms: осела
    assert.equal(ring.width, RING_WIDTH);
    assert.equal(ring.atRest, true);
  });

  test('повторный показ не перезапускает анимацию', () => {
    const ring = new FocusRing();

    ring.setVisible(true);
    ring.tick(1_000_000);
    ring.tick(1_600_000);
    ring.setVisible(true);

    assert.equal(ring.width, RING_WIDTH);
  });

  test('снятие фокуса убирает рамку сразу', () => {
    const ring = new FocusRing();

    ring.setVisible(true);
    ring.tick(1_000_000);
    ring.tick(1_150_000);
    ring.setVisible(false);

    assert.equal(ring.width, 0);
    assert.equal(ring.atRest, true);
  });
});
