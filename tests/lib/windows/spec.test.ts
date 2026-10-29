import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// Only the spec module is loaded: it must stay free of GJS, otherwise the
// window definitions could not be reasoned about (or tested) outside the shell.
import { isVerticalEdge, type PopSpec } from '@lib/windows/spec';

describe('spec', () => {
  test('spec loads in node and tells the edges apart', () => {
    const left: PopSpec = { id: 'a', edge: 'left', content: () => null! };
    const top: PopSpec = { id: 'b', edge: 'top', content: () => null! };

    assert.equal(isVerticalEdge(left), true);
    assert.equal(isVerticalEdge(top), false);
  });

  test('isVerticalEdge narrows the offset key', () => {
    const spec: PopSpec = {
      id: 'a',
      edge: 'left',
      offsetY: 10,
      content: () => null!,
    };

    if (isVerticalEdge(spec)) {
      assert.equal(spec.offsetY, 10);
    } else {
      assert.fail('a left edge is vertical');
    }
  });
});
