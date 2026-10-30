// Step-grid enforcement, shared by both sliders.
//
// Neither slider can extend a base class of ours - both already extend
// Astal.Slider - so the shared behavior lives in this function. Its guards
// stay in a closure instead of private fields.
//
// Three things happen here:
//
//  - The grid is applied on `adjustment::value-changed`. This is the path a
//    binding takes (it writes straight into the adjustment), and it is also
//    where a drag lands: `vfunc_change_value` applies the value, which emits
//    this signal.
//
//  - `change-value` is re-emitted snapped. It is RUN_LAST, so this closure
//    runs AFTER every handler connected to it - including gnim's
//    `onChangeValue`, which is connected right after construction. Without the
//    rewrite a consumer would see the raw pointer value (a click, the wheel)
//    while the widget had already landed on the grid.
//
//  - Everything is released on destroy: the adjustment may come from outside
//    and outlive the widget, and the handlers hold `this`.
import type { Gtk } from 'ags/gtk4';
// The versioned module, not `gi://Astal`: the unversioned declarations exist
// for both Astal 3 and 4, and the 3.0 one wins the lookup with a different
// Slider shape.
import type Astal from 'gi://Astal?version=4.0';
import GObject from 'gi://GObject';

import { snapToSlider } from './sliderStep';

export interface StepGridOptions {
  /** Called after every value change, snapped or not. */
  onValueChanged: () => void;
  /** Collects teardown callbacks, called on destroy. */
  onCleanup: (dispose: () => void) => void;
}

/**
 * The `change-value` closure both sliders share.
 *
 * It REPLACES GtkRange's own `gtk_range_real_change_value`, which is what
 * normally applies the value - so the value is set here in every case and
 * `true` is returned. Returning `false` would mean "not handled" to a handler
 * that no longer exists, and a drag would stop moving.
 *
 * The grid is not enforced here: `set_value` goes through the adjustment, and
 * that is where `enforceStepGrid` applies the snapping.
 */
export function applyChangeValue(slider: Astal.Slider, value: number): boolean {
  slider.set_value(value);

  return true;
}

/** Wire step snapping onto a slider. Call once, from the constructor. */
export function enforceStepGrid(
  slider: Astal.Slider,
  { onValueChanged, onCleanup }: StepGridOptions,
) {
  const adjustment = slider.get_adjustment();

  // Guards: both writes below emit the signals being listened to.
  let snapping = false;
  let rewriting = false;

  onCleanup(() => {
    adjustment.disconnect(valueId);
    slider.disconnect(changeId);
  });

  const valueId = adjustment.connect('value-changed', () => {
    if (!snapping) {
      const current = adjustment.get_value();
      const snapped = snapToSlider(slider, current);

      if (snapped !== current) {
        snapping = true;
        try {
          adjustment.set_value(snapped);
        } finally {
          snapping = false;
        }
      }
    }

    onValueChanged();
  });

  // `Astal.Slider`'s signature map has no `change-value`; GtkRange does.
  const range = slider as unknown as {
    connect(
      signal: 'change-value',
      cb: (
        widget: Gtk.Widget,
        scroll: Gtk.ScrollType,
        value: number,
      ) => boolean,
    ): number;
    emit(
      signal: 'change-value',
      scroll: Gtk.ScrollType,
      value: number,
    ): unknown;
  };

  const changeId = range.connect('change-value', (_widget, scroll, value) => {
    if (rewriting) {
      return false;
    }

    const snapped = snapToSlider(slider, value);

    if (snapped === value) {
      return false;
    }

    rewriting = true;
    try {
      GObject.signal_stop_emission_by_name(slider, 'change-value');
      slider.set_value(snapped);
      range.emit('change-value', scroll, snapped);
    } finally {
      rewriting = false;
    }

    return true;
  });
}
