import { FILE_TYPES, type FileTypes } from '@lib/files';
import type { Accessor } from 'ags';

import {
  isLeaf,
  type Leaf,
  type LeafSpec,
  type Node,
  type ReactiveNode,
  type ReactiveSection,
  type State,
} from './leaf';
import { type Config, SCHEMA } from './schema';

/** Common to every field: where it lives and how it is captioned in the form. */
type FieldBase<T> = {
  section: string;
  key: string;
  label?: string;
  value: Accessor<T>;
  set(value: T): void;
};

export type NumberField = FieldBase<number> & {
  kind: 'number';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
};

export type TextField = FieldBase<string> & {
  kind: 'text';
  placeholder?: string;
};

export type BoolField = FieldBase<boolean> & {
  kind: 'bool';
};

export type ChoiceField = FieldBase<string> & {
  kind: 'choice';
  options: readonly string[];
};

/** Absolute path to a file: entry plus a picker button. */
export type FileField = FieldBase<string> & {
  kind: 'file';
  accept: FileTypes;
};

/** Form field: value and set are already narrowed by kind - the form branches on it. */
export type Field =
  NumberField | TextField | BoolField | ChoiceField | FileField;

function makeField(
  section: string,
  key: string,
  spec: LeafSpec,
  node: ReactiveNode,
): Field {
  // The intersection of the spec with the reactive leaf - the only place where the types
  // diverge: the tree stores Leaf, the form wants a concrete leaf.
  const state = node as State<Leaf>;

  switch (spec.kind) {
    case 'number': {
      return {
        kind: 'number',
        section,
        key,
        label: spec.label,
        unit: spec.unit,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value: state as unknown as Accessor<number>,
        set: (value: number) => state.set(value),
      };
    }
    case 'text': {
      return {
        kind: 'text',
        section,
        key,
        label: spec.label,
        placeholder: spec.placeholder,
        value: state as unknown as Accessor<string>,
        set: (value: string) => state.set(value),
      };
    }
    case 'file': {
      return {
        kind: 'file',
        section,
        key,
        label: spec.label,
        accept: FILE_TYPES[spec.accept],
        value: state as unknown as Accessor<string>,
        set: (value: string) => state.set(value),
      };
    }
    case 'bool': {
      return {
        kind: 'bool',
        section,
        key,
        label: spec.label,
        value: state as unknown as Accessor<boolean>,
        set: (value: boolean) => state.set(value),
      };
    }
    case 'choice': {
      return {
        kind: 'choice',
        section,
        key,
        label: spec.label,
        options: spec.options,
        value: state as unknown as Accessor<string>,
        set: (value: string) => state.set(value),
      };
    }
  }
}

function walk(
  section: string,
  key: string,
  schema: Node,
  node: ReactiveNode,
  out: Field[],
): void {
  if (isLeaf(schema)) {
    out.push(makeField(section, key, schema, node));
    return;
  }

  const children = node as ReactiveSection;

  for (const [name, child] of Object.entries(schema)) {
    walk(section, name, child, children[name], out);
  }
}

/**
 * Flat list of config fields in schema order. The recursion lives here:
 * the form does not know how the spec relates to the reactive tree.
 */
export function fields(config: Config): Field[] {
  const out: Field[] = [];
  const tree = config as unknown as Record<string, ReactiveNode>;

  for (const [section, schema] of Object.entries(SCHEMA)) {
    const sectionTree = tree[section] as ReactiveSection;

    for (const [key, child] of Object.entries(schema)) {
      walk(section, key, child, sectionTree[key], out);
    }
  }

  return out;
}
