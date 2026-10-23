// Общие утилиты без GJS: их импортируют и приложение, и node-тесты.

/** Пустая функция: значение по умолчанию для отписки/колбэка. */
export const noop = () => {};

/**
 * Типизированный Object.assign: расширить объект/функцию методами,
 * сохранив исходный тип. Без Proxy и без потери методов аксессора.
 */
export const mixin = <T extends object, M extends object>(
  target: T,
  methods: M,
): T & M => Object.assign(target, methods);

/** Обычный объект: не null и не массив. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Значение того же примитивного типа, что и образец. Числа - только конечные:
 * NaN/Infinity из JSON не должны попадать в настройки.
 */
export function isSamePrimitive(
  value: unknown,
  sample: unknown,
): value is string | number | boolean {
  if (typeof value !== typeof sample) {
    return false;
  }

  return typeof value !== 'number' || Number.isFinite(value);
}
