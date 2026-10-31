// Where the three pieces of the media playhead sit, in the widget's
// coordinates.
//
// GtkRange lays its own children out and reports them through compute_bounds:
// the trough spans the whole track, `highlight` covers exactly the filled
// part (its left edge is the handle's center at the minimum, its width
// follows the value), and `slider` is the handle. Taking their real boxes
// instead of recomputing the layout means the wave lands on the same pixels
// GTK would have painted, whatever the theme does with padding.
//
// This is the media slider's layout. The plain M3 slider has its own in
// m3Layout.ts - it follows the spec, not the theme.
import type { Box } from '@lib/geometry';

import { handleCenterFor } from './sliderStep';

/** The raw boxes read from GtkRange's children. */
export interface TrackBoxes {
  trough: Box;
  /** The filled part: gives the track's thickness and center line. */
  fill: Box;
  handle: Box;
}

/** The value the playhead shows, and the range it lives in. */
export interface TrackValue {
  value: number;
  min: number;
  max: number;
}

/** Everything the painter needs, derived once per frame. */
export interface TrackLayout {
  /** Center line of the track, y. */
  centerY: number;
  /** Stroke thickness of the track, px. */
  thickness: number;
  /** Left edge of the fill: where the active part starts. */
  activeStart: number;
  /** Right edge of the fill: the value's position. */
  activeEnd: number;
  /** Right edge of the whole track. */
  trackEnd: number;
  /** Height of the handle, px. */
  handleHeight: number;
}

/**
 * Derive the track layout from the trough and the current value.
 *
 * The fill's right edge is computed from the value, not read from GTK's
 * `highlight`: `compute_bounds` returns whole pixels, so a playhead would step
 * a pixel at a time (about a second on a long track) however smoothly the
 * value changed. Drawn from the value it moves continuously, and GSK renders
 * the fraction.
 *
 * Everything else still comes from GTK: `trough` gives the span, and `fill`
 * gives the track's thickness and center line - it is the thin highlight, not
 * the handle, which would be far too thick.
 */
export function trackLayout(
  { trough, fill, handle }: TrackBoxes,
  { value, min, max }: TrackValue,
): TrackLayout {
  const trackEnd = trough.x + trough.width;

  return {
    centerY: fill.y + fill.height / 2,
    thickness: fill.height,
    activeStart: fill.x,
    activeEnd: handleCenterFor(value, min, max, trough.x, trackEnd),
    trackEnd,
    handleHeight: handle.height,
  };
}
