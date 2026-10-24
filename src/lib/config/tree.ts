import { Accessor } from 'ags';

import type {
  DeepPartial,
  Leaf,
  Limits,
  Reactive,
  ReactiveNode,
  ReactiveSection,
  Section,
  State,
} from './schema';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSection = (value: unknown): value is Section => isObject(value);

/**
 * Значение того же примитивного типа, что и образец. Числа - только конечные:
 * NaN/Infinity из JSON не должны попадать в настройки.
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

  return Object.assign(read, {
    set(next: T) {
      // NaN/Infinity из вычислений не должны попадать в настройки.
      if (typeof next === 'number' && !Number.isFinite(next)) {
        return;
      }

      const nextValue = clampNumber(next, range);

      // Листья - примитивы: сравнения по значению достаточно.
      if (Object.is(nextValue, value)) {
        return;
      }

      value = nextValue;
      for (const listener of listeners) {
        listener();
      }
      changed();
    },
  });
}

/** Статика → дерево реактивных значений. Объект - секция, остальное - лист. */
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

  // Дерево собрано по форме T - это знает только этот цикл.
  return tree as Reactive<T>;
}

/**
 * Обход реактивного дерева: узел-функция - состояние, вызываем; секцию
 * обходим дальше. Возвращает статику того же вида.
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

/** Обратно: реактивное дерево → статика (для файла). */
export function snapshot<T extends object>(tree: Reactive<T>): T {
  // Форма та же, что у T, только ключи точные.
  return read(tree) as T;
}

/**
 * Дефолты + значения из файла. Берётся только то, что есть в дефолтах и
 * совпадает по типу; остальное молча остаётся дефолтным - JSON не типизирован.
 */
export function merge<T extends Section>(defaults: T, raw: DeepPartial<T>): T {
  const source: Record<string, unknown> = raw;
  const out: Section = {};

  for (const [key, fallback] of Object.entries(defaults)) {
    const incoming = source[key];

    if (isSection(fallback)) {
      let section: Section = {};

      if (isSection(incoming)) {
        section = incoming;
      }

      out[key] = merge(fallback, section);
      continue;
    }

    if (isSamePrimitive(incoming, fallback)) {
      out[key] = incoming;
      continue;
    }

    out[key] = fallback;
  }

  return out as T;
}

/** Применить патч к реактивной ветке: чужие ключи игнорируются. */
export function patchInto(
  tree: ReactiveNode,
  values: DeepPartial<Section>,
): void {
  if (typeof tree === 'function') {
    return; // лист не секция - патчить нечего
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
