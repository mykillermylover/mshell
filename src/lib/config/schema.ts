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

/**
 * Весь конфиг - одна константа: новые параметры добавляются сюда, код вокруг
 * ничего не знает. Секции - объекты, листья - примитивы; вложенность любая.
 */
export const DEFAULTS = {
  theme: {
    mode: 'system', // system | light | dark
    scheme: 'scheme-tonal-spot', // тип схемы matugen
    wallpaper: '/home/mihail/Shared/Wallpapers/wallpaper.jpg', // путь к картинке; пусто - не генерировать
    contrast: 0, // -1..1, флаг matugen --contrast
  },
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

const THEME_LIMITS = {
  contrast: [-1, 1],
} as const satisfies Limits;

/** Лимиты style: применяются при загрузке, update и прямом .set(). */
export const LIMITS = {
  theme: THEME_LIMITS,
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
