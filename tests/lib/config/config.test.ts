import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  bool,
  type ConfigValues,
  DEFAULTS,
  LIMITS,
  merge,
  num,
  reactive,
  SCHEMA,
  snapshot,
} from '@lib/config';

/** As in the app: file contents → static config. */
const fromJson = (text: string) => merge(SCHEMA, JSON.parse(text));

describe('config', () => {
  describe('reactive', () => {
    test('reactive: nesting becomes a tree of states', () => {
      let changes = 0;
      const tree = reactive(
        { a: 1, deep: { b: 2, deeper: { c: 'x' } } },
        () => {
          changes++;
        },
      );
      assert.equal(tree.a(), 1);
      tree.a.set(5);
      tree.deep.deeper.c.set('y');
      assert.deepEqual(snapshot(tree), {
        a: 5,
        deep: { b: 2, deeper: { c: 'y' } },
      });
      assert.equal(changes, 2);
    });

    test('reactive: the same value — no notification', () => {
      let changes = 0;
      const tree = reactive({ a: 1 }, () => changes++);
      tree.a.set(1);
      assert.equal(changes, 0);
    });

    test('leaf accessor: peek, as, subscribe and unsubscribe', () => {
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

    test('reactive: limits clamp the initial value and set', () => {
      let changes = 0;
      const tree = reactive({ a: 999, deep: { b: 5 } }, () => changes++, {
        a: [0, 10],
        deep: { b: [0, 1] },
      } as const);

      assert.equal(tree.a(), 10);
      assert.equal(tree.deep.b(), 1);

      tree.a.set(-5); // → 0
      tree.deep.b.set(7); // → 1, no change
      tree.a.set(3); // → 3
      tree.deep.b.set(-1); // → 0
      tree.a.set(Number.NaN); // ignored
      tree.a.set(Number.POSITIVE_INFINITY); // ignored

      assert.equal(tree.a(), 3);
      assert.equal(tree.deep.b(), 0);
      assert.equal(changes, 3);
    });
  });

  describe('merge', () => {
    test('merge: a partial file is laid over the defaults', () => {
      const tree = fromJson('{"style": {"blurRadius": 8}}');
      assert.equal(tree.style.blurRadius, 8);
      assert.equal(tree.style.snapReach, DEFAULTS.style.snapReach);
      assert.equal(DEFAULTS.style.blurRadius, 10, 'defaults are not mutated');
    });

    test('merge: wrong types and unknown keys do not pass', () => {
      const tree = fromJson(
        '{"style": {"blurRadius": "8", "bogus": 1}, "other": {"x": 1}}',
      );
      assert.equal(tree.style.blurRadius, DEFAULTS.style.blurRadius);
      assert.ok(!('bogus' in tree.style));
      assert.ok(!('other' in tree));
    });

    test('merge: nesting of any depth', () => {
      const schema = {
        a: { b: num({ default: 1 }), c: { d: num({ default: 2 }) } },
        e: bool({ default: true }),
      };
      const tree = merge(schema, { a: { c: { d: 3 } } });
      assert.deepEqual(tree, { a: { b: 1, c: { d: 3 } }, e: true });
    });

    test('merge: an enum member passes, an unknown value → default', () => {
      const ok = fromJson('{"theme":{"mode":"dark"}}');
      assert.equal(ok.theme.mode, 'dark');

      const bad = fromJson('{"theme":{"mode":"banana"}}');
      assert.equal(bad.theme.mode, 'system');
    });

    test('merge: a number outside min/max is clamped', () => {
      assert.equal(fromJson('{"style":{"border":999}}').style.border, 32);
      assert.equal(fromJson('{"style":{"border":-5}}').style.border, 0);
    });

    test('merge: NaN and Infinity from JSON do not pass', () => {
      // JSON.parse cannot do NaN, but merge is also called with an object, not only with text.
      const tree = merge(SCHEMA, { style: { border: Number.NaN } });
      assert.equal(tree.style.border, 4);
      assert.equal(merge(SCHEMA, { style: { sharp: 1e9 } }).style.sharp, 20);
    });

    test('merge: boolean and string are checked by type', () => {
      const tree = merge(SCHEMA, {
        theme: { wallpaper: 42 },
        style: { sharp: '1' },
      });
      assert.equal(tree.theme.wallpaper, DEFAULTS.theme.wallpaper);
      assert.equal(tree.style.sharp, DEFAULTS.style.sharp);
    });

    test('merge: junk instead of a section does not crash', () => {
      const tree = merge(SCHEMA, { theme: 'nope', style: null });
      assert.deepEqual(tree, DEFAULTS);
    });

    test('merge: the result type is ConfigValues', () => {
      const tree: ConfigValues = fromJson('{}');
      assert.deepEqual(tree, DEFAULTS);
    });

    test('merge: a file leaf takes a string, anything else → default', () => {
      const path = fromJson('{"theme":{"wallpaper":"/wall.png"}}');
      assert.equal(path.theme.wallpaper, '/wall.png');

      const tree = fromJson('{"theme":{"wallpaper":42}}');
      assert.equal(tree.theme.wallpaper, DEFAULTS.theme.wallpaper);
    });

    test('merge: a bool leaf accepts only boolean', () => {
      const schema = { flag: bool({ default: true }) };
      assert.equal(merge(schema, { flag: false }).flag, false);
      assert.equal(merge(schema, { flag: 'yes' }).flag, true);
    });
  });

  describe('defaults and limits', () => {
    test('animations: defaults and limits', () => {
      assert.equal(DEFAULTS.style.snapDuration, 340);
      assert.equal(DEFAULTS.style.revealDuration, 400);
      assert.deepEqual(LIMITS.style.snapDuration, [0, 2000]);
      assert.deepEqual(LIMITS.style.revealDuration, [0, 2000]);
    });

    test('hover: defaults and limits of the zone and delays', () => {
      assert.equal(DEFAULTS.style.hoverDepth, 6);
      assert.deepEqual(LIMITS.style.hoverDepth, [1, 64]);
      assert.equal(DEFAULTS.style.hoverDelay, 120);
      assert.equal(DEFAULTS.style.hideDelay, 300);
      assert.deepEqual(LIMITS.style.hoverDelay, [0, 2000]);
      assert.deepEqual(LIMITS.style.hideDelay, [0, 2000]);
    });

    test('LIMITS: covers all style keys', () => {
      assert.deepEqual(
        Object.keys(LIMITS.style).sort(),
        Object.keys(DEFAULTS.style).sort(),
      );
    });
  });
});
