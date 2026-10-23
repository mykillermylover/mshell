/**
 * Типизированный Object.assign: расширить объект/функцию методами,
 * сохранив исходный тип. Без Proxy и без потери методов аксессора.
 */
export const mixin = <T extends object, M extends object>(
  target: T,
  methods: M,
): T & M => Object.assign(target, methods);
