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

/** The raw boxes read from GtkRange's children. */
export interface TrackBoxes {
  trough: Box;
  fill: Box;
  handle: Box;
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
 * Derive the track layout from the boxes GTK reported.
 *
 * All three children share the trough's center line and thickness; the fill
 * is the only one whose x range moves.
 *
 * A degenerate range (a stream with no length yet) leaves the fill pinned to
 * the start instead of dividing the fill box by a nonsense range.
 */
export function trackLayout({ trough, fill, handle }: TrackBoxes): TrackLayout {
  const width = Math.max(0, fill.width);

  return {
    centerY: fill.y + fill.height / 2,
    thickness: fill.height,
    activeStart: fill.x,
    activeEnd: fill.x + width,
    trackEnd: trough.x + trough.width,
    handleHeight: handle.height,
  };
}
