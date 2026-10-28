import { settable, type State } from '@lib/reactive';
import { Accessor } from 'ags';

import type { DeepPartial, Limits, Values } from './derive';
import { normalize } from './derive';
import type {
  Leaf,
  Node,
  Reactive,
  ReactiveNode,
  ReactiveSection,
  Section,
} from './leaf';
import { isLeaf } from './leaf';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSection = (value: unknown): value is Section => isObject(value);

/**
 * A value of the same primitive type as the sample. Numbers - only finite ones:
 * NaN/Infinity from JSON must not reach the settings.
 */
const isSamePrimitive = (
  value: unknown,
  sample: unknown,
): value is string | number | boolean => {
  if (typeof value !== typeof sample) {
    return false;
  }

  return typeof value !== 'number' || Number.isFinite(value);
};

const clampNumber = <T>(value: T, range?: readonly [number, number]): T =>
  typeof value === 'number' && range
    ? (Math.min(range[1], Math.max(range[0], value)) as T)
    : value;

function state<T>(
  init: T,
  changed: () => void,
  range?: readonly [number, number],
): State<T> {
  let value = clampNumber(init, range);
  const listeners = new Set<() => void>();

  const read = new Accessor<T>(
    () => value,
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  );

  return settable(read, (next: T) => {
    // NaN/Infinity from computations must not reach the settings.
    if (typeof next === 'number' && !Number.isFinite(next)) {
      return;
    }

    const nextValue = clampNumber(next, range);

    // Leaves are primitives: comparison by value is enough.
    if (Object.is(nextValue, value)) {
      return;
    }

    value = nextValue;
    for (const listener of listeners) {
      listener();
    }
    changed();
  });
}

/** Static config → reactive value tree. An object is a section, the rest is a leaf. */
export function reactive<T extends object>(
  init: T,
  changed: () => void,
  limits?: Limits,
): Reactive<T> {
  const tree: ReactiveSection = {};

  for (const [key, value] of Object.entries(init)) {
    if (isObject(value)) {
      const nested = limits?.[key];
      tree[key] = reactive(
        value,
        changed,
        isObject(nested) ? (nested as Limits) : undefined,
      );
      continue;
    }

    const range = limits?.[key];
    tree[key] = state(
      value,
      changed,
      Array.isArray(range) ? (range as readonly [number, number]) : undefined,
    );
  }

  // The tree is built to the shape of T - only this loop knows that.
  return tree as Reactive<T>;
}

/**
 * Walk the reactive tree: a function node is a state, so call it; a section
 * is walked further. Returns a static config of the same shape.
 */
function read(node: ReactiveNode): Leaf | Section {
  if (typeof node === 'function') {
    return node();
  }

  const out: Section = {};

  for (const [key, child] of Object.entries(node)) {
    out[key] = read(child);
  }

  return out;
}

/** Back: reactive tree → static config (for the file). */
export function snapshot<T extends object>(tree: Reactive<T>): T {
  // The shape is the same as T, only the keys are exact.
  return read(tree) as T;
}

/**
 * Schema + values from the file. For a leaf the spec decides: type, enum, limits.
 * Unknown keys and junk are silently replaced with defaults - JSON is not typed.
 */
export function merge<N extends object>(schema: N, raw: unknown): Values<N> {
  return mergeNode(schema as Node, raw) as Values<N>;
}

function mergeNode(node: Node, raw: unknown): Leaf | Section {
  if (isLeaf(node)) {
    return normalize(node, raw);
  }

  const source: Record<string, unknown> = isObject(raw) ? raw : {};
  const out: Section = {};

  for (const [key, child] of Object.entries(node)) {
    out[key] = mergeNode(child, source[key]);
  }

  return out;
}

/** Apply a patch to a reactive branch: unknown keys are ignored. */
export function patchInto(
  tree: ReactiveNode,
  values: DeepPartial<Section>,
): void {
  if (typeof tree === 'function') {
    return; // a leaf is not a section - nothing to patch
  }

  for (const [key, value] of Object.entries(values)) {
    const node = tree[key];

    if (node === undefined) {
      continue;
    }

    if (typeof node === 'function') {
      if (isSamePrimitive(value, node())) {
        node.set(value);
      }

      continue;
    }

    if (isSection(value)) {
      patchInto(node, value);
    }
  }
}
