import type { FileKind } from '@lib/files';
import {
  normalizeThemeScheme,
  ThemePreference,
  ThemePreferredColors,
  ThemeScheme,
} from '@lib/theme/policy';
import type { Accessor } from 'ags';

/** Config leaf: a value stored in JSON and compared by data. */
export type Leaf = string | number | boolean;

/** Static config: leaf or nested section. */
export type Section = { [key: string]: Leaf | Section };

/** Config leaf: Accessor plus setter. */
export type State<T> = Accessor<T> & { set(value: T): void };

/** Reactive tree node: leaf state or nested section. */
export type ReactiveNode = State<Leaf> | ReactiveSection;

/** Reactive tree section: nodes by name. */
export type ReactiveSection = { [key: string]: ReactiveNode };

/**
 * Tree where every leaf is replaced by State; the shape repeats the static one.
 * Plus access by name - walks and patches go through it.
 */
export type Reactive<T> = {
  [K in keyof T]: T[K] extends Leaf ? State<T[K]> : Reactive<T[K]>;
};

// --- Leaf description -----------------------------------------------------
// One declaration per key: value, limits and everything the form needs.

/** Common to every leaf: the value to start from and the caption in the form. */
export type LeafBase<T> = {
  default: T;
  label?: string;
};

export type NumberSpec = LeafBase<number> & {
  kind: 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export type TextSpec = LeafBase<string> & {
  kind: 'text';
  placeholder?: string;
};

export type BoolSpec = LeafBase<boolean> & {
  kind: 'bool';
};

export type ChoiceSpec<T extends string = string> = LeafBase<T> & {
  kind: 'choice';
  options: readonly T[];
  /** Input canonicalization; an unknown value after it → default. */
  normalize?: (raw: string) => T;
};

/**
 * Absolute path to a file; the form offers a picker next to the entry.
 * `accept` names a filter from FILE_TYPES - only the ones declared there.
 */
export type FileSpec = LeafBase<string> & {
  kind: 'file';
  accept: FileKind;
};

export type LeafSpec = NumberSpec | TextSpec | BoolSpec | ChoiceSpec | FileSpec;

/** Schema section: leaf or nested section. */
export type Node = LeafSpec | { readonly [key: string]: Node };

export const isLeaf = (node: Node): node is LeafSpec => 'kind' in node;

export const num = (spec: Omit<NumberSpec, 'kind'>): NumberSpec => ({
  kind: 'number',
  ...spec,
});

export const text = (spec: Omit<TextSpec, 'kind'>): TextSpec => ({
  kind: 'text',
  ...spec,
});

export const bool = (spec: Omit<BoolSpec, 'kind'>): BoolSpec => ({
  kind: 'bool',
  ...spec,
});

export const choice = <T extends string>(
  spec: Omit<ChoiceSpec<T>, 'kind'>,
): ChoiceSpec<T> => ({ kind: 'choice', ...spec });

export const file = (spec: Omit<FileSpec, 'kind'>): FileSpec => ({
  kind: 'file',
  ...spec,
});

/** Object.values without losing the enum type (otherwise you get string[]). */
const optionsOf = <T extends string>(values: Record<string, T>): readonly T[] =>
  Object.values(values);

// --- The config itself ----------------------------------------------------
// A new parameter = one line here. Key order = field order in the form.

export const SCHEMA = {
  theme: {
    mode: choice<ThemePreference>({
      default: ThemePreference.SYSTEM,
      options: optionsOf(ThemePreference),
      label: 'Mode',
    }),
    scheme: choice<ThemeScheme>({
      default: ThemeScheme.TONAL_SPOT,
      options: optionsOf(ThemeScheme),
      normalize: normalizeThemeScheme,
      label: 'Scheme',
    }),
    preferredColors: choice<ThemePreferredColors>({
      default: ThemePreferredColors.SATURATION,
      options: optionsOf(ThemePreferredColors),
      label: 'Preferred Colors',
    }),
    // Empty or a relative path - the palette is not generated.
    wallpaper: file({
      default: '',
      label: 'Wallpaper',
      accept: 'images',
    }),
    contrast: num({
      default: 0,
      min: -1,
      max: 1,
      step: 0.5,
      label: 'Contrast',
    }),
  },
  style: {
    border: num({ default: 4, min: 0, max: 32, label: 'Border', unit: 'px' }),
    screenRadius: num({
      // screen corners (= rounding in Hyprland)
      default: 10,
      min: 0,
      max: 64,
      label: 'Screen corners',
      unit: 'px',
    }),
    windowRadius: num({
      default: 12,
      min: 0,
      max: 64,
      label: 'Window corners',
      unit: 'px',
    }),
    // Blur radius: σ = blurRadius / 1.35.
    blurRadius: num({ default: 10, min: 1, max: 64, label: 'Blur' }),
    // Magnet reach: at what gap the window snaps, px.
    snapReach: num({
      default: 44,
      min: 0,
      max: 200,
      label: 'Magnet',
      unit: 'px',
    }),
    // Alpha threshold steepness: the higher, the sharper the edge (≈1.5px at 2.2).
    sharp: num({
      default: 2.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: 'Steepness',
    }),
    // Magnet/push-out tween duration, ms.
    snapDuration: num({
      default: 340,
      min: 0,
      max: 2000,
      label: 'Magnet, ms',
    }),
    // Pop and Float reveal/hide duration, ms.
    revealDuration: num({
      default: 400,
      min: 0,
      max: 2000,
      label: 'Reveal, ms',
    }),
    // Lip and input hover-zone thickness (see lib/windows/popLayout.ts).
    hoverDepth: num({ default: 6, min: 1, max: 64, label: 'Lip', unit: 'px' }),
    hoverDelay: num({
      // 0 - instant, as if there were no delays
      default: 120,
      min: 0,
      max: 2000,
      label: 'Hover delay, ms',
    }),
    hideDelay: num({
      default: 300,
      min: 0,
      max: 2000,
      label: 'Hide delay, ms',
    }),
  },
} satisfies Node;

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

/** Static config type: everything else relies on it. */
export type ConfigValues = Values<typeof SCHEMA>;

/** User style shared by fields, windows and config. */
export type FieldStyle = ConfigValues['style'];

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
  [key: string]: readonly [number, number] | Limits;
};

/**
 * Exact limits by schema shape: numeric leaves get a tuple, the rest get
 * no key. Needed so `LIMITS.style.border` reads as a tuple, not as a
 * `Limits` union (otherwise test typing breaks). We assume every
 * numeric leaf has both limits set - otherwise `limitsNode` writes no key.
 */
export type LimitsOf<N> = {
  [K in keyof N]: N[K] extends NumberSpec
    ? readonly [number, number]
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

export const DEFAULTS: ConfigValues = values(SCHEMA);

/**
 * Config limits: applied on load, update and direct .set().
 * `& LimitsOf` gives exact types on read, `& Limits` - compatibility with
 * `reactive()`.
 */
export const LIMITS = limits(SCHEMA) as unknown as Limits &
  LimitsOf<typeof SCHEMA>;

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

export type ConfigMethods = {
  /** Point edit of section leaves. */
  update<K extends keyof ConfigValues>(
    section: K,
    patch: DeepPartial<ConfigValues[K]>,
  ): void;
  /** Any change to any leaf. Returns an unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Write now (called on exit). */
  flush(): void;
};

export type Config = Reactive<ConfigValues> & ConfigMethods;
