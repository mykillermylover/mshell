import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type DeepPartial,
  DEFAULTS,
  LIMITS,
  merge,
  reactive,
  snapshot,
} from '@lib/config';

/** Как в приложении: содержимое файла → статика конфига. */
const fromJson = (text: string) =>
  merge(DEFAULTS, JSON.parse(text) as DeepPartial<typeof DEFAULTS>);

test('reactive: вложенность превращается в дерево состояний', () => {
  let changes = 0;
  const tree = reactive({ a: 1, deep: { b: 2, deeper: { c: 'x' } } }, () => {
    changes++;
  });
  assert.equal(tree.a(), 1);
  tree.a.set(5);
  tree.deep.deeper.c.set('y');
  assert.deepEqual(snapshot(tree), {
    a: 5,
    deep: { b: 2, deeper: { c: 'y' } },
  });
  assert.equal(changes, 2);
});

test('reactive: то же значение — без уведомления', () => {
  let changes = 0;
  const tree = reactive({ a: 1 }, () => changes++);
  tree.a.set(1);
  assert.equal(changes, 0);
});

test('accessor листа: peek, as, subscribe и отписка', () => {
  let changes = 0;
  const tree = reactive({ a: 1 }, () => changes++);
  let leafChanges = 0;

  const off = tree.a.subscribe(() => leafChanges++);
  const doubled = tree.a.as((value) => value * 2);
  const called = tree.a((value) => value * 2);

  assert.equal(tree.a.peek(), 1);
  assert.equal(doubled.peek(), 2);
  assert.equal(called(), 2);

  tree.a.set(2);
  assert.equal(leafChanges, 1);
  assert.equal(changes, 1);
  assert.equal(doubled(), 4);

  tree.a.set(2);
  assert.equal(leafChanges, 1);

  off();
  tree.a.set(3);
  assert.equal(leafChanges, 1);
  assert.equal(changes, 2);
});

test('merge: частичный файл ложится поверх дефолтов', () => {
  const tree = fromJson('{"style": {"blurRadius": 8}}');
  assert.equal(tree.style.blurRadius, 8);
  assert.equal(tree.style.snapReach, DEFAULTS.style.snapReach);
  assert.equal(DEFAULTS.style.blurRadius, 10, 'дефолты не мутируются');
});

test('merge: чужие типы и ключи не проходят', () => {
  const tree = fromJson(
    '{"style": {"blurRadius": "8", "bogus": 1}, "other": {"x": 1}}',
  );
  assert.equal(tree.style.blurRadius, DEFAULTS.style.blurRadius);
  assert.ok(!('bogus' in tree.style));
  assert.ok(!('other' in tree));
});

test('merge: вложенность любой глубины', () => {
  const tree = merge(
    { a: { b: 1, c: { d: 2 } }, e: true },
    { a: { c: { d: 3 } } },
  );
  assert.deepEqual(tree, { a: { b: 1, c: { d: 3 } }, e: true });
});

test('reactive: лимиты зажимают начальное значение и set', () => {
  let changes = 0;
  const tree = reactive({ a: 999, deep: { b: 5 } }, () => changes++, {
    a: [0, 10],
    deep: { b: [0, 1] },
  } as const);

  assert.equal(tree.a(), 10);
  assert.equal(tree.deep.b(), 1);

  tree.a.set(-5); // → 0
  tree.deep.b.set(7); // → 1, без изменения
  tree.a.set(3); // → 3
  tree.deep.b.set(-1); // → 0
  tree.a.set(Number.NaN); // игнорируется
  tree.a.set(Number.POSITIVE_INFINITY); // игнорируется

  assert.equal(tree.a(), 3);
  assert.equal(tree.deep.b(), 0);
  assert.equal(changes, 3);
});

test('анимации: дефолты и лимиты', () => {
  assert.equal(DEFAULTS.style.snapDuration, 340);
  assert.equal(DEFAULTS.style.revealDuration, 400);
  assert.deepEqual(LIMITS.style.snapDuration, [0, 2000]);
  assert.deepEqual(LIMITS.style.revealDuration, [0, 2000]);
});

test('hover: дефолты и лимиты зоны и задержек', () => {
  assert.equal(DEFAULTS.style.hoverDepth, 6);
  assert.deepEqual(LIMITS.style.hoverDepth, [1, 64]);
  assert.equal(DEFAULTS.style.hoverDelay, 120);
  assert.equal(DEFAULTS.style.hideDelay, 300);
  assert.deepEqual(LIMITS.style.hoverDelay, [0, 2000]);
  assert.deepEqual(LIMITS.style.hideDelay, [0, 2000]);
});

test('LIMITS: покрывает все ключи style', () => {
  assert.deepEqual(
    Object.keys(LIMITS.style).sort(),
    Object.keys(DEFAULTS.style).sort(),
  );
});
