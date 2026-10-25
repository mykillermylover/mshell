import {
  normalizeThemeScheme,
  ThemePreference,
  ThemeScheme,
} from '@lib/theme/policy';
import type { Accessor } from 'ags';

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

// --- Описание листа -------------------------------------------------------
// Одно объявление на ключ: значение, границы и всё, что нужно форме.

export type NumberSpec = {
  kind: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
};

export type TextSpec = {
  kind: 'text';
  default: string;
  label?: string;
  placeholder?: string;
};

export type BoolSpec = {
  kind: 'bool';
  default: boolean;
  label?: string;
};

export type ChoiceSpec<T extends string = string> = {
  kind: 'choice';
  default: T;
  options: readonly T[];
  label?: string;
  /** Канонизация входа; неизвестное значение после неё → default. */
  normalize?: (raw: string) => T;
};

export type LeafSpec = NumberSpec | TextSpec | BoolSpec | ChoiceSpec;

/** Секция схемы: лист или вложенная секция. */
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

/** Object.values без потери типа enum'а (иначе получается string[]). */
const optionsOf = <T extends string>(values: Record<string, T>): readonly T[] =>
  Object.values(values);

// --- Сам конфиг -----------------------------------------------------------
// Новый параметр = одна строка здесь. Порядок ключей = порядок полей в форме.

export const SCHEMA = {
  theme: {
    mode: choice<ThemePreference>({
      default: ThemePreference.SYSTEM,
      options: optionsOf(ThemePreference),
      label: 'Режим',
    }),
    scheme: choice<ThemeScheme>({
      default: ThemeScheme.TONAL_SPOT,
      options: optionsOf(ThemeScheme),
      normalize: normalizeThemeScheme,
      label: 'Схема',
    }),
    // Пусто или относительный путь - палитра не генерируется.
    wallpaper: text({
      default: '/home/mihail/Shared/Wallpapers/wallpaper.jpg',
      label: 'Обои',
    }),
    contrast: num({
      default: 0,
      min: -1,
      max: 1,
      step: 0.5,
      label: 'Контраст',
    }),
  },
  style: {
    border: num({ default: 4, min: 0, max: 32, label: 'Рамка', unit: 'px' }),
    screenRadius: num({
      // углы экрана (= rounding в Hyprland)
      default: 10,
      min: 0,
      max: 64,
      label: 'Углы экрана',
      unit: 'px',
    }),
    windowRadius: num({
      default: 12,
      min: 0,
      max: 64,
      label: 'Углы окон',
      unit: 'px',
    }),
    // Радиус размытия: σ = blurRadius / 1.35.
    blurRadius: num({ default: 10, min: 1, max: 64, label: 'Размытие' }),
    // Дальность магнита: на каком зазоре окно притягивается, px.
    snapReach: num({
      default: 44,
      min: 0,
      max: 200,
      label: 'Магнит',
      unit: 'px',
    }),
    // Крутизна порога по альфе: чем больше, тем чётче край (≈1.5px при 2.2).
    sharp: num({
      default: 2.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: 'Крутизна',
    }),
    // Длительность твина магнита/выпихивания, мс.
    snapDuration: num({
      default: 340,
      min: 0,
      max: 2000,
      label: 'Магнит, мс',
    }),
    // Длительность выезда/скрытия Pop и Float, мс.
    revealDuration: num({
      default: 400,
      min: 0,
      max: 2000,
      label: 'Выезд, мс',
    }),
    // Толщина губы и input hover-зоны (см. lib/windows/popLayout.ts).
    hoverDepth: num({ default: 6, min: 1, max: 64, label: 'Губа', unit: 'px' }),
    hoverDelay: num({
      // 0 - мгновенно, как без задержек
      default: 120,
      min: 0,
      max: 2000,
      label: 'Задержка hover, мс',
    }),
    hideDelay: num({
      default: 300,
      min: 0,
      max: 2000,
      label: 'Задержка скрытия, мс',
    }),
  },
} satisfies Node;

// --- Вывод типов и значений ----------------------------------------------
// Числа/строки/булевы расширяются до базовых типов (иначе .set принимал бы
// только литерал дефолта), enum-тип сохраняется.

export type Values<N> =
  N extends ChoiceSpec<infer T>
    ? T
    : N extends NumberSpec
      ? number
      : N extends BoolSpec
        ? boolean
        : N extends TextSpec
          ? string
          : N extends object
            ? { [K in keyof N]: Values<N[K]> }
            : never;

/** Статика конфига - тип, на который опирается всё остальное. */
export type ConfigValues = Values<typeof SCHEMA>;

/** Пользовательский стиль, общий для поля, окон и конфига. */
export type FieldStyle = ConfigValues['style'];

/** То же дерево с необязательными ключами на всех уровнях. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Leaf ? T[K] : DeepPartial<T[K]>;
};

/** Схема → статика дефолтов. */
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

/** Лимиты листа: [min, max] для числа либо вложенный объект для секции. */
export type Limits = {
  [key: string]: readonly [number, number] | Limits;
};

/**
 * Точные лимиты по форме схемы: у числовых листьев - кортеж, у остальных -
 * ключа нет. Нужен, чтобы `LIMITS.style.border` читался как кортеж, а не как
 * `Limits`-объединение (иначе ломается типизация тестов). Считаем, что у всех
 * числовых листьев заданы обе границы - иначе `limitsNode` ключ не пишет.
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

/** Схема → лимиты для reactive(): только числа, у которых заданы обе границы. */
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
 * Лимиты конфига: применяются при загрузке, update и прямом .set().
 * `& LimitsOf` даёт точные типы при чтении, `& Limits` - совместимость с
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
 * Сырое значение из JSON → лист. Чужой тип, NaN/Infinity и значения вне
 * enum'а молча заменяются дефолтом; числа зажимаются в min/max.
 */
export function normalize(spec: LeafSpec, raw: unknown): Leaf {
  switch (spec.kind) {
    case 'number': {
      return typeof raw === 'number' && Number.isFinite(raw)
        ? clamp(raw, spec.min, spec.max)
        : spec.default;
    }
    case 'text': {
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
