// Where the pieces of an M3 slider sit, in the widget's coordinates.
//
// Pure numbers: no GTK, so both modes are testable in node. MSlider feeds
// the result straight into m3Painter.
//
// The numbers come from the Material 3 tokens (SliderTokens.kt): a 16 dp
// track, a 4 x 44 dp handle, a 6 dp gap either side of the handle and a 4 dp
// stop indicator. None of that is what GtkScale draws - GTK's trough is 2 px
// and its handle is a 16 px square - so only the *positions* are taken from
// GTK (trough and fill bounds) and the sizes are ours.

import type { Box } from '@lib/geometry';

/** The raw boxes read from GtkRange's children. */
export interface TrackBoxes {
  trough: Box;
  fill: Box;
  /** The handle widget. Unused by the layout: the fill marks its center. */
  handle: Box;
}

/**
 * `standard` - the fill runs from the start of the track to the handle.
 * `centered` - the fill runs from the center of the track to the handle, so
 * it switches sides as the handle crosses the center.
 */
export type SliderMode = 'standard' | 'centered';

/** M3 dimensions, px. They are the spec, not a theme setting. */
export const TRACK_HEIGHT = 16;
export const HANDLE_WIDTH = 4;
export const HANDLE_WIDTH_PRESSED = 2;
export const HANDLE_HEIGHT = 44;
/** Space between the handle and the track on either side, at rest. */
export const HANDLE_GAP = 6;
/**
 * The whole break around the handle, px. Fixed: the handle thins to 2 px on
 * press, and the break must not shrink with it, or the track visibly closes
 * in on the finger.
 */
export const BREAK_WIDTH = HANDLE_WIDTH + 2 * HANDLE_GAP;
export const STOP_SIZE = 4;
/**
 * Radius of the track's outer ends - `CornerFull` in the tokens: a stadium,
 * so the cap is a true semicircle.
 */
export const TRACK_RADIUS = TRACK_HEIGHT / 2;
/**
 * Radius of the cut faces: `TrackInsideCornerSize`, a rounded square rather
 * than a semicircle. The two ends of the track are shaped differently on
 * purpose - that is what tells the eye where the track really stops.
 */
export const TRACK_INSIDE_RADIUS = 4;
/**
 * Half-width of the gap the centered track keeps at the middle. Smaller than
 * the break around the handle: the center is a seam, not a thumb's width.
 */
export const CENTER_GAP = 5;

/** A piece of track to paint, and whether it is the filled one. */
export interface Segment {
  from: number;
  to: number;
  active: boolean;
  /**
   * Which ends are the track's real ends. Every other end is a cut - at the
   * handle or at the center - and takes the smaller radius.
   */
  roundStart: boolean;
  roundEnd: boolean;
}

/** Everything the painter needs, derived once per frame. */
export interface TrackLayout {
  /** Center line of the track, y. */
  centerY: number;
  thickness: number;
  /** Center of the handle, x - where the value sits. */
  handleX: number;
  handleWidth: number;
  handleHeight: number;
  /**
   * Radius for the outer ends of the track, and for the cuts at the handle
   * and at the center. They differ by design: semicircle vs rounded square.
   */
  outerRadius: number;
  innerRadius: number;
  /** The track pieces to paint, in drawing order. */
  segments: Segment[];
  /** Whether each end carries a stop indicator; `centered` has both. */
  stopAtStart: boolean;
  stopAtEnd: boolean;
  /** Where the two stop indicators sit: the handle's travel ends. */
  stopStartX: number;
  stopEndX: number;
  /** Where the middle of the track sits, and its painted ends. */
  centerX: number;
  trackStart: number;
  trackEnd: number;
}

export interface LayoutOptions {
  mode: SliderMode;
  /** The current value and its range: the handle's position comes from it. */
  value: number;
  min: number;
  max: number;
  /** Whether the handle is held: M3 thins it from 4 px to 2 px. */
  pressed: boolean;
  /** Whether the ends carry stop indicators at all. */
  stopIndicators: boolean;
}

/**
 * Derive the layout from the trough box and the current value.
 *
 * Three spans are derived from the trough, nested inside each other:
 *   travel - where GtkRange moves the handle's center, a pixel inside the
 *            trough at each end; the stop indicators sit exactly here;
 *   track  - what is painted: a cap radius past the travel, so the dots lie
 *            inside a body instead of hanging off its edge.
 *
 * The handle's position comes from the value, not from `highlight`: the fill
 * box is 0 px wide at the minimum while the handle already sits a pixel in.
 */
export function trackLayout(
  { trough }: TrackBoxes,
  { mode, pressed, stopIndicators, value, min, max }: LayoutOptions,
): TrackLayout {
  const centerY = trough.y + TRACK_HEIGHT / 2;
  // Measured: GtkRange moves the handle's center over
  // `trough.x + 1 .. trough.right - 1` regardless of the handle's width.
  const travelStart = trough.x + 1;
  const travelEnd = trough.x + trough.width - 1;
  const trackStart = travelStart - TRACK_RADIUS;
  const trackEnd = travelEnd + TRACK_RADIUS;
  const centerX = (trackStart + trackEnd) / 2;
  // The handle's position comes from the VALUE, not from `highlight`: the
  // fill box is 0 px wide at the minimum while the handle already sits a
  // pixel in. One mapping for the drawing keeps every part in step.
  const handleX = handleCenterFor(value, min, max, travelStart, travelEnd);

  const width = pressed ? HANDLE_WIDTH_PRESSED : HANDLE_WIDTH;
  // The break is a fixed width centered on the handle, not a padding from its
  // edges: pressing thins the handle, and the gap must stay put.
  const beforeHandle = handleX - BREAK_WIDTH / 2;
  const afterHandle = handleX + BREAK_WIDTH / 2;

  const segments =
    mode === 'centered'
      ? centeredSegments(
          trackStart,
          trackEnd,
          centerX,
          handleX,
          beforeHandle,
          afterHandle,
        )
      : standardSegments(trackStart, trackEnd, beforeHandle, afterHandle);

  return {
    centerY,
    thickness: TRACK_HEIGHT,
    handleX,
    handleWidth: width,
    handleHeight: HANDLE_HEIGHT,
    outerRadius: TRACK_RADIUS,
    innerRadius: TRACK_INSIDE_RADIUS,
    segments,
    // A `standard` slider has nothing to mark at its start - the fill covers
    // it. A `centered` one has two sections, and the far end of the left
    // section is a real end of travel, so it gets its own dot.
    stopAtStart: stopIndicators && mode === 'centered',
    stopAtEnd: stopIndicators,
    // Dead center under the handle at min and at max: the dot is the limit,
    // not a decoration near it.
    stopStartX: travelStart,
    stopEndX: travelEnd,
    centerX,
    trackStart,
    trackEnd,
  };
}

/**
 * Map a value to the handle's center, between two travel ends.
 *
 * Measured, not derived: on a 1680 px trough the center runs 1..1679, on an
 * 820 px one 1..819 - so it spans the trough minus a pixel at each end, and
 * the handle's own width plays no part.
 */
export function handleCenterFor(
  value: number,
  min: number,
  max: number,
  travelStart: number,
  travelEnd: number,
): number {
  if (!(max > min)) {
    return travelStart;
  }

  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));

  return travelStart + t * (travelEnd - travelStart);
}

function standardSegments(
  trackStart: number,
  trackEnd: number,
  beforeHandle: number,
  afterHandle: number,
): Segment[] {
  // The end beside the handle is a cut, the far end is the track's own end -
  // same rule as in the centered mode.
  return [
    {
      from: trackStart,
      to: Math.max(trackStart, beforeHandle),
      active: true,
      roundStart: true,
      roundEnd: false,
    },
    {
      from: Math.min(trackEnd, afterHandle),
      to: trackEnd,
      active: false,
      roundStart: false,
      roundEnd: true,
    },
  ].filter((segment) => segment.to > segment.from);
}

/**
 * Two branches from the center: the filled part runs from the center to the
 * handle, whichever side the handle is on.
 *
 * Built by subtracting from one continuous track rather than by assembling
 * pieces: the break around the handle and the seam at the center are holes
 * punched out first, and what is left is split wherever the filled band (the
 * span between the handle and the center) starts or ends. Nothing can be
 * emitted twice, and no hole can be painted over.
 */
function centeredSegments(
  trackStart: number,
  trackEnd: number,
  centerX: number,
  handleX: number,
  beforeHandle: number,
  afterHandle: number,
): Segment[] {
  const holes = [
    { from: beforeHandle, to: afterHandle },
    { from: centerX - CENTER_GAP, to: centerX + CENTER_GAP },
  ].sort((a, b) => a.from - b.from);

  // The stretches of track between the holes, in track order.
  const spans: { from: number; to: number }[] = [];
  let cursor = trackStart;

  for (const hole of holes) {
    spans.push({ from: cursor, to: Math.min(hole.from, trackEnd) });
    cursor = Math.max(cursor, hole.to);
  }
  spans.push({ from: cursor, to: trackEnd });

  // A point is filled when it lies between the handle and the center.
  const lo = Math.min(handleX, centerX);
  const hi = Math.max(handleX, centerX);
  const isFilled = (x: number) => x > lo && x < hi;

  const segments: Segment[] = [];

  for (const span of spans) {
    if (span.to <= span.from) {
      continue;
    }

    // Boundaries of the filled band that fall inside the span, plus its ends.
    const cuts = [
      span.from,
      ...[lo, hi].filter((x) => x > span.from && x < span.to),
      span.to,
    ].sort((a, b) => a - b);

    const last = cuts.length - 1;

    for (let i = 0; i < last; i++) {
      const from = cuts[i];
      const to = cuts[i + 1];

      if (to <= from) {
        continue;
      }

      segments.push({
        from,
        to,
        active: isFilled((from + to) / 2),
        // Only the track's own ends are round; every other end is a cut.
        roundStart: i === 0 && span.from === trackStart,
        roundEnd: i === last - 1 && span.to === trackEnd,
      });
    }
  }

  return segments;
}
