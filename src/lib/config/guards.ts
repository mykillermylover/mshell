/** Обычный объект: не null и не массив. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Совпадение по данным, а не по ссылке: примитивы — Object.is, объекты —
 * рекурсивно по ключам. Нужно как раз для сравнения «того же» конфига,
 * пришедшего новым объектом.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (!isObject(a) || !isObject(b)) {
    return false;
  }

  const keys = Object.keys(a);

  if (keys.length !== Object.keys(b).length) {
    return false;
  }

  return keys.every((key) => key in b && isEqual(a[key], b[key]));
}

/**
 * Значение того же примитивного типа, что и образец. Числа — только конечные:
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
