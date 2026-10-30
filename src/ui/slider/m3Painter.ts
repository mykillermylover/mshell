// Drawing an M3 slider: rounded track pieces, a handle bar and stop
// indicators, as Gsk nodes.
//
// Everything here takes plain numbers and colors, so the layout module
// decides where things go and this file only puts paint on a snapshot.
import type { Gdk, Gtk } from 'ags/gtk4';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';

import { type Segment, STOP_SIZE, type TrackLayout } from './m3Layout';

export interface M3Paint {
  layout: TrackLayout;
  /** Fill, handle and the stop indicator on the active end. */
  active: Gdk.RGBA;
  /** The track still to come. */
  inactive: Gdk.RGBA;
  /** The stop indicator on an unfilled end: `on_secondary_container`. */
  inactiveStop: Gdk.RGBA;
}

/** Paint the whole slider, back to front. */
export function paintM3(snapshot: Gtk.Snapshot, paint: M3Paint) {
  const { layout } = paint;

  for (const segment of layout.segments) {
    segmentPath(
      snapshot,
      segment,
      layout.centerY,
      layout.thickness,
      segment.active ? paint.active : paint.inactive,
      layout,
    );
  }

  if (layout.stopAtStart) {
    endMark(snapshot, layout, paint, 'start');
  }

  if (layout.stopAtEnd) {
    endMark(snapshot, layout, paint, 'end');
  }

  handle(snapshot, layout, paint.active);
}

/**
 * One piece of track.
 *
 * Its two ends are shaped differently on purpose: an outer end of the whole
 * track is a semicircle (`outerRadius`), while a cut - beside the handle or
 * at the center - is a rounded square (`innerRadius`). That difference is
 * what tells the eye where the track really stops.
 *
 * Drawn as a single rounded rect per segment: Gsk.RoundedRect rounds all four
 * corners, so building a stadium out of a body plus "half" caps leaves
 * ellipses at every seam.
 */
function segmentPath(
  snapshot: Gtk.Snapshot,
  segment: Segment,
  centerY: number,
  thickness: number,
  color: Gdk.RGBA,
  layout: TrackLayout,
) {
  const left = segment.from;
  const right = segment.to;

  if (right <= left) {
    return;
  }

  const half = (right - left) / 2;
  // An outer end is a semicircle, a cut is a rounded square.
  const startRadius = Math.min(
    segment.roundStart ? layout.outerRadius : layout.innerRadius,
    half,
  );
  const endRadius = Math.min(
    segment.roundEnd ? layout.outerRadius : layout.innerRadius,
    half,
  );
  const corner = (radius: number) => new Graphene.Size().init(radius, radius);

  const rect = new Graphene.Rect().init(
    left,
    centerY - thickness / 2,
    right - left,
    thickness,
  );
  const rounded = new Gsk.RoundedRect().init(
    rect,
    corner(startRadius),
    corner(endRadius),
    corner(endRadius),
    corner(startRadius),
  );

  snapshot.push_rounded_clip(rounded);
  snapshot.append_color(color, rect);
  snapshot.pop();
}

/** The handle: a bar whose width follows the pressed token. */
function handle(snapshot: Gtk.Snapshot, layout: TrackLayout, color: Gdk.RGBA) {
  const rect = new Graphene.Rect().init(
    layout.handleX - layout.handleWidth / 2,
    layout.centerY - layout.handleHeight / 2,
    layout.handleWidth,
    layout.handleHeight,
  );

  snapshot.push_rounded_clip(
    new Gsk.RoundedRect().init_from_rect(rect, layout.handleWidth / 2),
  );
  snapshot.append_color(color, rect);
  snapshot.pop();
}

/** A stop indicator: a small dot inside the rounded end. */
function endMark(
  snapshot: Gtk.Snapshot,
  layout: TrackLayout,
  paint: M3Paint,
  side: 'start' | 'end',
) {
  const x = side === 'start' ? layout.stopStartX : layout.stopEndX;

  // The left end is always the unfilled one: the fill grows from there.
  const color = side === 'start' ? paint.inactiveStop : paint.active;
  const rect = new Graphene.Rect().init(
    x - STOP_SIZE / 2,
    layout.centerY - STOP_SIZE / 2,
    STOP_SIZE,
    STOP_SIZE,
  );

  snapshot.push_rounded_clip(
    new Gsk.RoundedRect().init_from_rect(rect, STOP_SIZE / 2),
  );
  snapshot.append_color(color, rect);
  snapshot.pop();
}
