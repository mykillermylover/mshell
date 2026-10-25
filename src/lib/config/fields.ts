import type { Accessor } from 'ags';

import {
  type Config,
  isLeaf,
  type Leaf,
  type LeafSpec,
  type Node,
  type ReactiveNode,
  type ReactiveSection,
  SCHEMA,
  type State,
} from './schema';

export type NumberField = {
  kind: 'number';
  section: string;
  key: string;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  value: Accessor<number>;
  set(value: number): void;
};

export type TextField = {
  kind: 'text';
  section: string;
  key: string;
  label?: string;
  placeholder?: string;
  value: Accessor<string>;
  set(value: string): void;
};

export type BoolField = {
  kind: 'bool';
  section: string;
  key: string;
  label?: string;
  value: Accessor<boolean>;
  set(value: boolean): void;
};

export type ChoiceField = {
  kind: 'choice';
  section: string;
  key: string;
  label?: string;
  options: readonly string[];
  value: Accessor<string>;
  set(value: string): void;
};

/** Поле формы: value и set уже сужены по kind - форма ветвится по нему. */
export type Field = NumberField | TextField | BoolField | ChoiceField;

function makeField(
  section: string,
  key: string,
  spec: LeafSpec,
  node: ReactiveNode,
): Field {
  // Пересечение спеки с реактивным листом - единственное место, где типы
  // расходятся: дерево хранит Leaf, форма хочет конкретный лист.
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
 * Плоский список полей конфига в порядке схемы. Рекурсия живёт здесь:
 * форма не знает, как спека соотносится с реактивным деревом.
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
