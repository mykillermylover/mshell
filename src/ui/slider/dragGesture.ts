// Drag detection shared by both sliders.
//
// Neither slider can extend a base class of ours - both already extend
// Astal.Slider - so the shared behavior lives in this function, the same way
// the step grid does in stepGrid.ts. Each slider keeps only what it does with
// the news: MSlider thickens the handle, MMediaSlider flattens the wave.
//
// The gesture is the scale's own GtkGestureDrag, not a copy of its logic:
// GtkRange installs one and claims the sequence on it, so nothing of ours
// would ever see the events.
//
// The start comes from drag-update, not drag-begin: GTK has no drag threshold,
// so drag-begin fires on the press itself - a plain tap that only rewinds must
// not count as a drag. The first offset past DRAG_THRESHOLD is what tells a
// drag from a tap.
//
// Note the ordering: a drag-update handler connected here runs AFTER the one
// GtkRange installed, so by the time `onStart` fires the value has already
// moved by that first step. The hook reports the interaction, it does not get
// to veto it.
import { Gtk } from 'ags/gtk4'; // first: pins Gtk 4 before Gsk is loaded
import type Astal from 'gi://Astal?version=4.0';

import { exceedsDragThreshold } from './sliderMath';

/** The signals both sliders add on top of the ones Astal.Slider already has. */
export interface DragSignals {
  'drag-start': () => void;
  'drag-end': () => void;
}

/**
 * The full signal map of a slider that reports drags.
 *
 * Declared on the class as `declare $signals: SliderSignals` so gnim can infer
 * the `onDragStart`/`onDragEnd` props in JSX. The intersection matters: a bare
 * object would hide the inherited `onChangeValue`.
 */
export type SliderSignals = Astal.Slider.SignalSignatures & DragSignals;

export interface DragHooks {
  /** The pointer moved past the threshold: a drag, not a tap. */
  onStart: () => void;
  /** The drag ended or was cancelled. Always paired with an `onStart`. */
  onEnd: () => void;
}

/**
 * Report drag starts and ends on the widget's own drag gesture.
 *
 * Returns a disposer for the connected handlers; the gesture itself belongs to
 * the widget and lives as long as it does. The disposer is a no-op when the
 * widget has no drag gesture.
 */
export function wireDrag(
  widget: Gtk.Widget,
  { onStart, onEnd }: DragHooks,
): () => void {
  const drag = dragGestureOf(widget);

  if (!drag) {
    return () => {};
  }

  let started = false;

  const update = drag.connect(
    'drag-update',
    (_gesture: Gtk.GestureDrag, x: number, y: number) => {
      if (started || !exceedsDragThreshold(x, y)) {
        return;
      }

      started = true;
      onStart();
    },
  );

  // A gesture can also stop without a drag-end - a grab, or a parent widget's
  // controller claiming the sequence - so both endings report the same thing.
  const end = () => {
    if (!started) {
      return;
    }

    started = false;
    onEnd();
  };

  const dragEnd = drag.connect('drag-end', end);
  const cancel = drag.connect('cancel', end);

  return () => {
    drag.disconnect(update);
    drag.disconnect(dragEnd);
    drag.disconnect(cancel);
  };
}

/** The widget's own drag gesture, or null when GTK installed none. */
function dragGestureOf(widget: Gtk.Widget): Gtk.GestureDrag | null {
  const controllers = widget.observe_controllers();

  for (let i = 0; i < controllers.get_n_items(); i++) {
    const controller = controllers.get_item(i);

    if (controller instanceof Gtk.GestureDrag) {
      return controller;
    }
  }

  return null;
}
