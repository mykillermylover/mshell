// Drawing the focus ring, and driving it from the widget's focus state.
//
// The geometry and the timing are in focusRing.ts; this file only puts paint
// on a snapshot and owns the tick loop.
import type { Gdk, Gtk } from 'ags/gtk4';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';

import type { FocusRing } from './focusRing';
import { RING_GAP_X, RING_GAP_Y, RING_RADIUS } from './focusRing';

/** Where the ring goes: the handle it wraps. */
export interface RingBox {
  /** Center of the handle, x. */
  x: number;
  /** Center line of the track, y. */
  centerY: number;
  handleWidth: number;
  handleHeight: number;
}

/** Draw the ring around the handle, or nothing when `width` is 0. */
export function paintFocusRing(
  snapshot: Gtk.Snapshot,
  box: RingBox,
  width: number,
  color: Gdk.RGBA,
) {
  if (width <= 0) {
    return;
  }

  const rect = new Graphene.Rect().init(
    box.x - box.handleWidth / 2 - RING_GAP_X,
    box.centerY - box.handleHeight / 2 - RING_GAP_Y,
    box.handleWidth + 2 * RING_GAP_X,
    box.handleHeight + 2 * RING_GAP_Y,
  );
  const path = new Gsk.PathBuilder();

  path.add_rounded_rect(
    new Gsk.RoundedRect().init_from_rect(rect, RING_RADIUS),
  );
  snapshot.append_stroke(path.to_path(), new Gsk.Stroke(width), color);
}

/**
 * Drive a ring from the widget's focus state, repainting while it moves.
 *
 * `has_visible_focus` is the keyboard-only focus the ring is for: a click
 * focuses the slider without it, and no ring is drawn. Returns a disposer.
 */
export function wireFocusRing(
  widget: Gtk.Widget,
  ring: FocusRing,
  repaint: () => void,
): () => void {
  let tickId = 0;

  const stop = () => {
    if (tickId !== 0) {
      widget.remove_tick_callback(tickId);
      tickId = 0;
    }
  };

  const start = () => {
    if (tickId !== 0 || ring.atRest) {
      return;
    }

    tickId = widget.add_tick_callback(
      (_widget: Gtk.Widget, clock: Gdk.FrameClock) => {
        ring.tick(clock.get_frame_time());
        repaint();

        if (ring.atRest) {
          tickId = 0;
          return false;
        }

        return true;
      },
    );
  };

  const sync = () => {
    ring.setVisible(widget.has_visible_focus());
    repaint();
    start();
  };

  // Two signals, not one: `notify::has-focus` fires when the widget takes
  // focus, but the window decides `focus-visible` afterwards - and setting it
  // on the widget does not notify. `state-flags-changed` is what reports the
  // FOCUS_VISIBLE flag actually landing.
  const ids = [
    widget.connect('notify::has-focus', sync),
    widget.connect('state-flags-changed', sync),
  ];

  return () => {
    stop();

    for (const id of ids) {
      widget.disconnect(id);
    }
  };
}
