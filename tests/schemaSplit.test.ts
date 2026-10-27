import assert from 'node:assert/strict';
import test from 'node:test';

import { limits, values } from '@lib/config/derive';
// The leaf descriptors and the inference are separate modules: neither may pull
// GJS, otherwise the schema could not be inspected outside the shell.
import { file, isLeaf, num } from '@lib/config/leaf';
import { SCHEMA } from '@lib/config/schema';

test('leaf: descriptors are built without the schema', () => {
  const spec = num({ default: 3, min: 0, max: 10 });

  assert.equal(spec.kind, 'number');
  assert.ok(isLeaf(spec));
  assert.equal(file({ default: '', accept: 'images' }).kind, 'file');
});

test('derive: values follow the schema shape', () => {
  const defaults = values(SCHEMA);

  assert.equal(defaults.style.border, 4);
});

test('derive: limits come from min/max of a numeric leaf', () => {
  const spec = num({ default: 5, min: 1, max: 9 });
  const tree = { nested: { scale: spec } };

  assert.deepEqual(limits(tree).nested, { scale: [1, 9] });
});
