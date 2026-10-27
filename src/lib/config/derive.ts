// What is derived from the schema: values, limits and the JSON normalizer.
// A pure function of a Node tree - no schema literal, no GJS.
import {
  type BoolSpec,
  type ChoiceSpec,
  type FileSpec,
  isLeaf,
  type Leaf,
  type LeafSpec,
  type Node,
  type NumberSpec,
  type Section,
  type TextSpec,
} from './leaf';

// --- Type and value inference --------------------------------------------
// Numbers/strings/booleans widen to base types (otherwise .set would accept
// only the default literal), the enum type is preserved.

export type Values<N> =
  N extends ChoiceSpec<infer T>
    ? T
    : N extends NumberSpec
      ? number
      : N extends BoolSpec
        ? boolean
        : N extends TextSpec | FileSpec
          ? string
          : N extends object
            ? { [K in keyof N]: Values<N[K]> }
            : never;

/** The same tree with optional keys at every level. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Leaf ? T[K] : DeepPartial<T[K]>;
};

/** Schema → static defaults. */
export function values<N extends object>(node: N): Values<N> {
  return valuesNode(node as Node) as Values<N>;
}

function valuesNode(node: Node): Leaf | Section {
  if (isLeaf(node)) {
    return node.default;
  }

  const out: Section = {};

  for (const [key, child] of Object.entries(node)) {
    out[key] = valuesNode(child);
  }

  return out;
}

/** Leaf limits: [min, max] for a number or a nested object for a section. */
export type Limits = {
  [key: string]: readonly [min: number, max: number] | Limits;
};

/**
 * Exact limits by schema shape: numeric leaves get a tuple, the rest get
 * no key. Needed so `LIMITS.style.border` reads as a tuple, not as a
 * `Limits` union (otherwise test typing breaks). We assume every
 * numeric leaf has both limits set - otherwise `limitsNode` writes no key.
 */
export type LimitsOf<N> = {
  [K in keyof N]: N[K] extends NumberSpec
    ? readonly [min: number, max: number]
    : N[K] extends LeafSpec
      ? never
      : N[K] extends object
        ? LimitsOf<N[K]>
        : never;
};

/** Schema → limits for reactive(): only numbers that have both limits set. */
export function limits<N extends object>(node: N): Limits {
  return limitsNode(node as Node);
}

function limitsNode(node: Node): Limits {
  const out: Limits = {};

  if (isLeaf(node)) {
    return out;
  }

  for (const [key, child] of Object.entries(node)) {
    if (isLeaf(child)) {
      if (
        child.kind === 'number' &&
        child.min !== undefined &&
        child.max !== undefined
      ) {
        out[key] = [child.min, child.max];
      }

      continue;
    }

    out[key] = limitsNode(child);
  }

  return out;
}

const clamp = (value: number, min?: number, max?: number): number =>
  Math.min(max ?? value, Math.max(min ?? value, value));

function pickChoice<T extends string>(spec: ChoiceSpec<T>, raw: unknown): T {
  if (typeof raw !== 'string') {
    return spec.default;
  }

  const value = spec.normalize ? spec.normalize(raw) : raw;

  return (spec.options as readonly string[]).includes(value)
    ? (value as T)
    : spec.default;
}

/**
 * Raw value from JSON → leaf. A wrong type, NaN/Infinity and values outside
 * the enum are silently replaced with the default; numbers are clamped to min/max.
 */
export function normalize(spec: LeafSpec, raw: unknown): Leaf {
  switch (spec.kind) {
    case 'number': {
      return typeof raw === 'number' && Number.isFinite(raw)
        ? clamp(raw, spec.min, spec.max)
        : spec.default;
    }
    case 'text':
    case 'file': {
      return typeof raw === 'string' ? raw : spec.default;
    }
    case 'bool': {
      return typeof raw === 'boolean' ? raw : spec.default;
    }
    case 'choice': {
      return pickChoice(spec, raw);
    }
  }
}
