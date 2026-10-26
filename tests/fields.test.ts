import { type Config, type ConfigMethods, DEFAULTS, fields, LIMITS, reactive, SCHEMA, } from '@lib/config';
import { FILE_TYPES } from '@lib/files';
import assert from 'node:assert/strict';
import test from 'node:test';

const noop = () => {};

/** Config as in the app, without GJS: reactive tree + method stubs. */
function makeConfig(): Config {
  const methods: ConfigMethods = {
    update: noop,
    subscribe: () => noop,
    flush: noop,
  };

  return Object.assign(
    {},
    reactive(structuredClone(DEFAULTS), () => {
    }, LIMITS),
    methods,
  ) as Config;
}

test('fields: covers every leaf of the schema', () => {
  const config = makeConfig();
  const list = fields(config);

  const expected: string[] = [];
  for (const [section, node] of Object.entries(SCHEMA)) {
    for (const key of Object.keys(node)) {
      expected.push(`${section}.${key}`);
    }
  }

  assert.deepEqual(
    list.map((f) => `${f.section}.${f.key}`),
    expected,
  );
});

test('fields: kind matches the spec, metadata is in place', () => {
  const list = fields(makeConfig());
  const border = list.find((f) => f.key === 'border');

  assert.ok(border);
  assert.equal(border.kind, 'number');
  assert.equal(border.label, 'Border');
  if (border.kind === 'number') {
    assert.equal(border.unit, 'px');
    assert.equal(border.min, 0);
    assert.equal(border.max, 32);
  }

  const mode = list.find((f) => f.key === 'mode');
  assert.ok(mode);
  assert.equal(mode.kind, 'choice');
  if (mode.kind === 'choice') {
    assert.ok(mode.options.includes('dark'));
  }
});

test('fields: set changes the tree, value reads it', () => {
  const config = makeConfig();
  const border = fields(config).find((f) => f.key === 'border');

  assert.ok(border && border.kind === 'number');
  assert.equal(border.value(), 4);

  border.set(9);
  assert.equal(config.style.border(), 9);
  assert.equal(border.value(), 9);

  // clamping by limits works through the field too
  border.set(999);
  assert.equal(config.style.border(), 32);
});

test('fields: choice.set writes an enum value', () => {
  const config = makeConfig();
  const mode = fields(config).find((f) => f.key === 'mode');

  assert.ok(mode && mode.kind === 'choice');
  mode.set('dark');
  assert.equal(config.theme.mode(), 'dark');
});

test('fields: file accepts an absolute path', () => {
  const config = makeConfig();
  const wallpaper = fields(config).find((f) => f.key === 'wallpaper');

  assert.ok(wallpaper && wallpaper.kind === 'file');
  assert.equal(wallpaper.accept, FILE_TYPES.images);
  assert.equal(wallpaper.value(), '');

  wallpaper.set('/home/user/wall.png');
  assert.equal(config.theme.wallpaper(), '/home/user/wall.png');
  assert.equal(wallpaper.value(), '/home/user/wall.png');
});
