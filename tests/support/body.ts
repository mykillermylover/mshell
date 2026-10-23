import type { Body } from '@lib/liquid/geometry';

/** Фабрика тестовых тел: ширина по умолчанию задаётся в каждом файле. */
export const makeBody =
  (defaultWidth: number) =>
  (
    x: number,
    y: number,
    w = defaultWidth,
    h = 100,
    cornerRadius = 12,
  ): Body => ({
    x,
    y,
    w,
    h,
    cornerRadius,
  });
