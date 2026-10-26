import assert from 'node:assert/strict';
import test from 'node:test';

import { FILE_TYPES } from '@lib/files';

// The table claims a suffix resolves to a listed mime type; a typo like
// `image/jpg` (the real type is image/jpeg) never matches and GTK reports nothing.
const EXPECTED: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  bmp: ['image/bmp'],
  tiff: ['image/tiff'],
  tif: ['image/tiff'],
  avif: ['image/avif'],
};

test('file types: every suffix maps to a listed mime type', () => {
  for (const types of Object.values(FILE_TYPES)) {
    for (const suffix of types.suffixes) {
      const mime = EXPECTED[suffix];

      assert.ok(mime, `unexpected suffix: ${suffix}`);
      for (const type of mime) {
        assert.ok(
          types.mimeTypes.includes(type),
          `${suffix} → ${type} is missing from mimeTypes`,
        );
      }
    }

    assert.equal(types.mimeTypes.length, new Set(types.mimeTypes).size);
    assert.equal(types.suffixes.length, new Set(types.suffixes).size);
  }
});

test('file types: every mime type has a matching suffix', () => {
  for (const types of Object.values(FILE_TYPES)) {
    const covered = new Set(
      types.suffixes.flatMap((suffix) => EXPECTED[suffix] ?? []),
    );

    assert.deepEqual(
      [...types.mimeTypes].sort(),
      [...covered].sort(),
      'a mime type without a suffix only matches sniffed content',
    );
  }
});
