// Минимальный стенд-ин Accessor для node-тестов: настоящий `ags` тянет
// GJS (gi://GObject). Контракт повторяет gnim Accessor, который использует
// приложение; тесты проверяют логику конфига, а не internals gnim.
type Callback = () => void;

export interface Accessor<T = unknown> {
  (): T;
  <R>(compute: (value: T) => R): Accessor<R>;
  peek(): T;
  as<R>(transform: (value: T) => R): Accessor<R>;
  subscribe(fn: Callback): () => void;
}

export const Accessor = function <T>(
  get: () => T,
  subscribe: (fn: Callback) => () => void,
): Accessor<T> {
  const read = ((arg?: unknown) => {
    if (typeof arg === 'function') {
      const compute = arg as (value: T) => unknown;
      return new Accessor(() => compute(get()), subscribe);
    }
    return get();
  }) as Accessor<T>;

  read.peek = get;
  read.subscribe = subscribe;
  read.as = <R>(transform: (value: T) => R) =>
    new Accessor(() => transform(get()), subscribe);

  return read;
} as unknown as new <T>(
  get: () => T,
  subscribe: (fn: Callback) => () => void,
) => Accessor<T>;
