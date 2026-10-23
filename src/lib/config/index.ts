import { isObject, isSamePrimitive, mixin } from '@lib/utils';
import { Accessor } from 'ags';

/** Лист конфига: значение, которое кладётся в JSON и сравнивается по данным. */
export type Leaf = string | number | boolean;

/** Статика: лист или вложенная секция. */
export type Section = { [key: string]: Leaf | Section };

/** Лист конфига: Accessor плюс запись. */
export type State<T> = Accessor<T> & { set(value: T): void };

/** Узел реактивного дерева: состояние листа или вложенная секция. */
export type ReactiveNode = State<Leaf> | ReactiveSection;

/** Секция реактивного дерева: узлы по имени. */
export type ReactiveSection = { [key: string]: ReactiveNode };

/**
 * Дерево, где каждый лист заменён на State; форма повторяет статику.
 * Плюс доступ по имени - по нему ходят обходы и патчи.
 */
export type Reactive<T> = {
  [K in keyof T]: T[K] extends Leaf ? State<T[K]> : Reactive<T[K]>;
};

/**
 * Весь конфиг - одна константа: новые параметры добавляются сюда, код вокруг
 * ничего не знает. Секции - объекты, листья - примитивы; вложенность любая.
 */
export const DEFAULTS = {
  style: {
    border: 4, // толщина рамки
    screenRadius: 10, // углы экрана (= rounding в Hyprland)
    windowRadius: 12, // углы окон
    blurRadius: 10, // радиус размытия: σ = blurRadius / 1.35
    snapReach: 44, // дальность магнита: на каком зазоре окно притягивается, px
    sharp: 2.2, // крутизна порога по альфе: чем больше, тем чётче край (≈1.5px при 2.2)
    snapDuration: 340, // длительность твина магнита/выпихивания, мс
    revealDuration: 400, // длительность выезда/скрытия Pop и Float, мс
    // Толщина губы и input hover-зоны (см. lib/windows/popLayout.ts).
    hoverDepth: 6,
    // 0 - мгновенно, как без задержек.
    hoverDelay: 120,
    hideDelay: 300,
  },
} satisfies Record<string, Section>;

/** Пользовательский стиль, общий для поля, окон и конфига. */
export type FieldStyle = typeof DEFAULTS.style;

/** Лимиты листа: [min, max] для числа либо вложенный объект для секции. */
export type Limits = {
  [key: string]: readonly [number, number] | Limits;
};

const STYLE_LIMITS = {
  border: [0, 32],
  screenRadius: [0, 64],
  windowRadius: [0, 64],
  blurRadius: [1, 64],
  snapReach: [0, 200],
  sharp: [0.1, 20],
  snapDuration: [0, 2000],
  revealDuration: [0, 2000],
  hoverDepth: [1, 64],
  hoverDelay: [0, 2000],
  hideDelay: [0, 2000],
} as const satisfies Record<keyof FieldStyle, readonly [number, number]>;

/** Лимиты style: применяются при загрузке, update и прямом .set(). */
export const LIMITS = {
  style: STYLE_LIMITS,
} as const satisfies Limits;

/** Статика конфига - тип, на который опирается всё остальное. */
export type ConfigValues = typeof DEFAULTS;

/** То же дерево с необязательными ключами на всех уровнях. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Leaf ? T[K] : DeepPartial<T[K]>;
};

export type ConfigMethods = {
  /** Точечная правка листьев секции. */
  update<K extends keyof ConfigValues>(
    section: K,
    patch: DeepPartial<ConfigValues[K]>,
  ): void;
  /** Любое изменение любого листа. Возвращает отписку. */
  subscribe(fn: () => void): () => void;
  /** Записать сейчас (вызывается на выходе). */
  flush(): void;
};

export type Config = Reactive<ConfigValues> & ConfigMethods;

function isSection(value: unknown): value is Section {
  return isObject(value);
}

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

  return mixin(read, {
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
