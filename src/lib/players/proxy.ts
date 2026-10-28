// Обёртка GObject: свойства читаются как Accessor, методы вызываются на
// исходном объекте. Тип Wrapped выводится из самого класса, руками не
// пишется — при обновлении @girs он не дрейфует.
import type { State } from '@lib/reactive';
import { settable } from '@lib/reactive';
import { createBinding } from 'ags';
import type AstalMpris from 'gi://AstalMpris';
import type GObject from 'gi://GObject';

// Чтение остаётся Accessor, запись — set на нём же (lib/reactive), поэтому
// instanceof Accessor и JSX не ломаются. Важно: .as() возвращает новый
// Accessor без set — это ожидаемо, для записи нужен Accessor из обёртки.
type ReactiveProps<T> = {
  [K in keyof T as T[K] extends (...a: never[]) => unknown ? never : K]: State<
    T[K]
  >;
};

type PlainMethods<T> = {
  [K in keyof T as T[K] extends (...a: never[]) => unknown ? K : never]: T[K];
};

export type Wrapped<T> = ReactiveProps<T> & PlainMethods<T>;

/**
 * Разделение свойств и методов решается один раз на имя и кэшируется:
 * Reflect.get читает геттер, а геттер position в AstalMpris — синхронный
 * D-Bus вызов. На hot-path должно читаться только значение из Map.
 */
export function wrap<T extends GObject.Object>(raw: T): Wrapped<T> {
  const bindings = new Map<PropertyKey, State<unknown>>();
  const method = new Map<PropertyKey, boolean>();

  return new Proxy(raw, {
    get(obj, prop) {
      // Символы (inspect, toPrimitive) отдаём как есть.
      if (typeof prop === 'symbol') {
        return Reflect.get(obj, prop);
      }

      // Прокси не должен быть thenable: иначе `await player` зависнет.
      if (prop === 'then') {
        return;
      }

      let isMethod = method.get(prop);
      if (isMethod === undefined) {
        isMethod = typeof Reflect.get(obj, prop) === 'function';
        method.set(prop, isMethod);
      }

      if (isMethod) {
        // bind: без него GJS передаст `this = Proxy` и упадёт на приватных полях.
        // Явные аргументы (object, PropertyKey) отключают условный возврат
        // Reflect.get по keyof T: динамический ключ иначе не позвать.
        return Reflect.get<object, PropertyKey>(obj, prop).bind(obj);
      }

      let binding = bindings.get(prop);
      if (!binding) {
        // createBinding типизирован на литеральные ключи, а здесь ключ
        // динамический — единственное приведение в файле. Сеттер навешивается
        // при создании, так `p.position === p.position` и `p.position.set`
        // не пересоздаются.
        binding = settable(
          createBinding(obj, prop as never),
          (value: unknown) => {
            Reflect.set(obj, prop, value);
          },
        );
        bindings.set(prop, binding);
      }

      return binding;
    },

    set(obj, prop, value) {
      // Сырое присваивание из JS всё ещё работает; документированный путь
      // для записи — accessor.set, а не это.
      return Reflect.set(obj, prop, value);
    },
  }) as Wrapped<T>;
}

export type Player = Wrapped<AstalMpris.Player>;
