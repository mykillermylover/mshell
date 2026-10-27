import type { Body } from '@lib/field/geometry';

/** Test body factory: the default width is set in each file. */
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
