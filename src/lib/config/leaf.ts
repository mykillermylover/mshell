// Leaf descriptors: one declaration per key - the value, the limits and what
// the form needs. No schema, no GJS.
import type { FileKind } from '@lib/config/fileTypes';
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
export const optionsOf = <T extends string>(
  values: Record<string, T>,
): readonly T[] => Object.values(values);
