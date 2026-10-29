import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEFAULTS,
  isLeaf,
  LIMITS,
  num,
  SCHEMA,
  text,
  values,
} from '@lib/config';
// The leaf descriptors and the inference are separate modules: neither may pull
// GJS, otherwise the schema could not be inspected outside the shell.
import { limits } from '@lib/config/derive';
import { file } from '@lib/config/leaf';
import { ThemePreference, ThemeScheme } from '@lib/theme/policy';

describe('schema', () => {
  describe('leaf', () => {
    test('descriptors are built without the schema', () => {
      const spec = num({ default: 3, min: 0, max: 10 });

      assert.equal(spec.kind, 'number');
      assert.ok(isLeaf(spec));
      assert.equal(file({ default: '', accept: 'images' }).kind, 'file');
    });

    test('builders fill in the kind automatically', () => {
      const spec = num({
        default: 3,
        min: 0,
        max: 10,
        label: 'Test',
        unit: 'px',
      });
      assert.equal(spec.kind, 'number');
      assert.ok(isLeaf(spec));
      assert.ok(!isLeaf({ nested: spec }));
      assert.equal(text({ default: '' }).kind, 'text');
    });
  });

  describe('derive', () => {
    test('values follow the schema shape', () => {
      assert.equal(values(SCHEMA).style.border, 4);
    });

    test('limits come from min/max of a numeric leaf', () => {
      const spec = num({ default: 5, min: 1, max: 9 });
      const tree = { nested: { scale: spec } };

      assert.deepEqual(limits(tree).nested, { scale: [1, 9] });
    });

    test('limits ignore text', () => {
      assert.deepEqual(LIMITS.style.border, [0, 32]);
      assert.deepEqual(LIMITS.style.hoverDepth, [1, 64]);
      assert.deepEqual(LIMITS.theme.contrast, [-1, 1]);
      assert.ok(!('wallpaper' in LIMITS.theme));
      assert.ok(!('mode' in LIMITS.theme));
    });

    test('limits cover all numeric style keys', () => {
      const numeric = Object.keys(DEFAULTS.style).sort();
      assert.deepEqual(Object.keys(LIMITS.style).sort(), numeric);
    });
  });

  describe('values', () => {
    test('defaults are inferred from the schema, the shape is the same', () => {
      assert.deepEqual(values(SCHEMA), DEFAULTS);
      assert.equal(DEFAULTS.theme.mode, ThemePreference.SYSTEM);
      assert.equal(DEFAULTS.theme.scheme, ThemeScheme.TONAL_SPOT);
      assert.equal(DEFAULTS.style.border, 4);
    });

    test('leaves are copied by value, not by reference', () => {
      const copy = values(SCHEMA);
      copy.style.border = 99;
      assert.equal(DEFAULTS.style.border, 4, 'DEFAULTS is not mutated');
    });
  });
});
