import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScene } from '../src/lib/liquid/scene';

const frame = { w: 1260, h: 840, border: 4, screenRadius: 10 };
const style = { windowRadius: 12, meltRadius: 10, waistReach: 44 };

test('buildScene: тела и мостики из общей геометрии', () => {
  const scene = buildScene([{ x: 100, y: 10, w: 100, h: 100 }], frame, style);

  assert.equal(scene.bodies.length, 1);
  assert.equal(scene.bodies[0].cornerRadius, 12);
  assert.equal(scene.bridges.length, 1);
});

test('buildScene: маленькое тело зажимает радиус половиной стороны', () => {
  const [body] = buildScene(
    [{ x: 100, y: 300, w: 10, h: 10 }],
    frame,
    style,
  ).bodies;

  assert.equal(body.cornerRadius, 5);
});

test('buildScene: далёкое тело без мостиков', () => {
  assert.deepEqual(
    buildScene([{ x: 600, y: 400, w: 100, h: 100 }], frame, style).bridges,
    [],
  );
});
