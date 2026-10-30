// Where the visualizer grows from. Geometry modules always build the shape in
// one frame: `x` runs with the value index (0..L), `y` runs from the top of
// the shape (0 = loud, A = silence). An anchor turns that frame in the widget
// instead of redrawing the shape differently.
//
// Both axes turn together, so the values never get mirrored:
//   bottom - zero at the bottom, values left to right
//   top    - zero at the top,    values right to left
//   left   - zero at the left,   values top to bottom
//   right  - zero at the right,  values bottom to top
import type { Point, Rect } from '@lib/geometry';

export type CavaAnchor = 'bottom' | 'top' | 'left' | 'right';

/** Extent of the shape's own frame, not a widget size. */
export interface Size {
  /** Extent of the values axis, px. */
  along: number;
  /** Extent of the level axis, px. */
  across: number;
}

/** The anchor is vertical: the level runs along x instead of y. */
export const isVertical = (anchor: CavaAnchor) =>
  anchor === 'left' || anchor === 'right';

/**
 * The stage for the geometry: the widget turned so that the shape always runs
 * along the returned `along`, with its levels across `across`.
 */
export function plotSize(
  anchor: CavaAnchor,
  width: number,
  height: number,
): Size {
  return isVertical(anchor)
    ? { along: height, across: width }
    : { along: width, across: height };
}

/**
 * A point of the shape in widget coordinates. `along` is the position on the
 * values axis, `y` the height from the top of the shape (0 = loud).
 */
export function anchorPoint(
  anchor: CavaAnchor,
  along: number,
  y: number,
  width: number,
  height: number,
): Point {
  const { along: length, across } = plotSize(anchor, width, height);

  switch (anchor) {
    case 'top': {
      return { x: length - along, y: across - y };
    }
    case 'left': {
      return { x: across - y, y: along };
    }
    case 'right': {
      return { x: y, y: length - along };
    }
    default: {
      return { x: along, y };
    }
  }
}

/** The same turn for a bar: `w` runs along the values axis, `h` across it. */
export function anchorRect(
  anchor: CavaAnchor,
  bar: Rect,
  width: number,
  height: number,
): Rect {
  const { along: length, across } = plotSize(anchor, width, height);

  switch (anchor) {
    case 'top': {
      return {
        x: length - bar.x - bar.w,
        y: across - bar.y - bar.h,
        w: bar.w,
        h: bar.h,
      };
    }
    case 'left': {
      return {
        x: across - bar.y - bar.h,
        y: bar.x,
        w: bar.h,
        h: bar.w,
      };
    }
    case 'right': {
      return {
        x: bar.y,
        y: length - bar.x - bar.w,
        w: bar.h,
        h: bar.w,
      };
    }
    default: {
      return bar;
    }
  }
}
