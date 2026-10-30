// Drawing the track: three strokes and a pill, in Gsk nodes.
//
// Everything here takes plain numbers and colors, so the caller decides what
// goes where and this file only knows how to put paint on a snapshot.
import type { Point } from '@lib/geometry';
import type { Gdk, Gtk } from 'ags/gtk4';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';

import { WAVE_LENGTH, wavePoints } from './sliderMath';
import type { TrackLayout } from './trackLayout';

/** Below ~2 px per sample the crests turn into a zigzag. */
const SAMPLE_STEP = 2;
/** The M3 handle: a pill, 4 dp wide whatever the track height. */
const PILL_WIDTH = 4;

export interface TrackPaint {
  layout: TrackLayout;
  /** Wave displacement now, px. 0 draws a straight line. */
  amplitude: number;
  /** Where the crests sit along x, px. */
  phase: number;
  /** Color of the active part and the handle. */
  active: Gdk.RGBA;
  /** Color of the part that is still to come. */
  inactive: Gdk.RGBA;
}

/**
 * Reused across frames: `wavePoints` writes into the existing points, so a
 * 60 fps repaint allocates nothing after the first frame.
 */
export type PointBuffer = Point[];

/**
 * Paint the whole track: inactive part, active part (straight or wavy), and
 * the handle pill on top.
 *
 * The inactive part starts where the pill ends, so the two never cross, and
 * the active part stops at the pill's left edge for the same reason.
 */
export function paintTrack(
  snapshot: Gtk.Snapshot,
  paint: TrackPaint,
  buffer: PointBuffer,
) {
  const { layout, amplitude, phase, active, inactive } = paint;
  const { centerY, thickness, activeStart, activeEnd, trackEnd } = layout;

  const pillLeft = activeEnd - PILL_WIDTH / 2;
  const pillRight = activeEnd + PILL_WIDTH / 2;

  line(snapshot, pillRight, trackEnd, centerY, thickness, inactive);

  if (pillLeft > activeStart) {
    if (amplitude > 0) {
      wave(
        snapshot,
        buffer,
        activeStart,
        pillLeft,
        centerY,
        thickness,
        amplitude,
        phase,
        active,
      );
    } else {
      line(snapshot, activeStart, pillLeft, centerY, thickness, active);
    }
  }

  pill(snapshot, pillLeft, centerY, layout.handleHeight, active);
}

/** A flat piece of track between two x positions. */
function line(
  snapshot: Gtk.Snapshot,
  from: number,
  to: number,
  y: number,
  thickness: number,
  color: Gdk.RGBA,
) {
  if (to <= from) {
    return;
  }

  const path = new Gsk.PathBuilder();

  path.move_to(from, y);
  path.line_to(to, y);

  stroke(snapshot, path, thickness, color);
}

/** One stroked path with round caps; `join` only matters for the wavy one. */
function stroke(
  snapshot: Gtk.Snapshot,
  path: Gsk.PathBuilder,
  thickness: number,
  color: Gdk.RGBA,
  join?: Gsk.LineJoin,
) {
  const pen = new Gsk.Stroke(thickness);

  pen.set_line_cap(Gsk.LineCap.ROUND);

  if (join !== undefined) {
    pen.set_line_join(join);
  }

  snapshot.append_stroke(path.to_path(), pen, color);
}

/** The running sine along the active part. */
function wave(
  snapshot: Gtk.Snapshot,
  buffer: PointBuffer,
  from: number,
  to: number,
  y: number,
  thickness: number,
  amplitude: number,
  phase: number,
  color: Gdk.RGBA,
) {
  const count = wavePoints(
    buffer,
    from,
    to,
    y,
    amplitude,
    phase,
    WAVE_LENGTH,
    SAMPLE_STEP,
  );

  const path = new Gsk.PathBuilder();
  const first = buffer[0];

  path.move_to(first.x, first.y);

  for (let i = 1; i < count; i++) {
    const point = buffer[i];

    path.line_to(point.x, point.y);
  }

  stroke(snapshot, path, thickness, color, Gsk.LineJoin.ROUND);
}

/** The handle: a rounded M3 pill. */
function pill(
  snapshot: Gtk.Snapshot,
  left: number,
  centerY: number,
  height: number,
  color: Gdk.RGBA,
) {
  const rect = new Graphene.Rect().init(
    left,
    centerY - height / 2,
    PILL_WIDTH,
    height,
  );

  snapshot.push_rounded_clip(
    new Gsk.RoundedRect().init_from_rect(rect, PILL_WIDTH / 2),
  );
  snapshot.append_color(color, rect);
  snapshot.pop();
}
