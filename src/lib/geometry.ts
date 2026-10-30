// Small numeric shapes shared across the codebase.
//
// These are plain data: no GTK, no methods, no units baked in. Whether a size
// is in px or dp, or a rect is in field or widget coordinates, is the caller's
// business - the type only says the numbers form a rectangle.

/** A position. */
export interface Point {
  x: number;
  y: number;
}

/** A width and a height. */
export interface Size {
  width: number;
  height: number;
}

/** A rectangle by its top-left corner and extent. */
export interface Box extends Point, Size {}

/**
 * A rectangle by corner and extent, with the short field names.
 *
 * Same shape as {@link Box}; both spellings exist because the geometry code
 * reads better with `w`/`h` in long formulas, and the widget code with
 * `width`/`height`. Use either, do not mix them inside one module.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
