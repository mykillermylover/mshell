// An M3 slider: standard or centered, drawn to the Material spec rather than
// to the GTK theme.
//
// GtkScale cannot be talked into this shape. Its track is 2 px, its handle a
// 16 px square, and nothing in CSS can cut a 6 dp window around the handle or
// thin it to 2 px on press. So, like MMediaSlider, this widget keeps GTK for
// what GTK is good at - input, focus, accessibility, the step grid - and
// paints the track itself in vfunc_snapshot.
//
// Unlike MMediaSlider it does not inherit GTK's geometry: the M3 sizes are the
// spec, so only the *positions* come from GtkRange.
import { property, register, signal } from 'ags/gobject';
import type { Gtk } from 'ags/gtk4';
import { Gdk } from 'ags/gtk4';
import { Astal } from 'ags/gtk4';

import { type SliderSignals, wireDrag } from './dragGesture';
import { FocusRing } from './focusRing';
import { paintFocusRing, wireFocusRing } from './focusRingPainter';
import { type SliderMode, type TrackBoxes, trackLayout } from './m3Layout';
import { type M3Paint, paintM3 } from './m3Painter';
import { currentParts, partsBoxes, type SliderParts } from './sliderParts';
import { applyChangeValue, enforceStepGrid } from './stepGrid';
import { ValueTween } from './valueTween';

/** The native slider this one extends; a value, so it has to come at runtime. */
const AstalSlider = Astal.Slider;

export interface MSliderProps extends Partial<Astal.Slider.ConstructorProps> {
  /** `standard` (default) fills from the start, `centered` from the middle. */
  mode?: SliderMode;
  /** Paint the 4 dp stop indicator at the trailing end. Off by default. */
  stopIndicators?: boolean;
}

/**
 * The M3 slider.
 *
 * The track is painted by this widget; the native trough, fill and handle are
 * hidden by CSS (styles/ui/_plain-slider.scss), which is the only place the
 * rules can live - a provider on a widget's own context never reaches its
 * internal CSS nodes.
 */
@register({ GTypeName: 'MSlider' })
export default class MSlider extends AstalSlider {
  /** Drag hooks; `declare` keeps the inherited signal types visible in JSX. */
  declare $signals: SliderSignals;

  @property(String)
  mode: SliderMode = 'standard';

  @property(Boolean)
  stopIndicators = false;

  readonly #cleanups: (() => void)[] = [];

  #parts: SliderParts | null = null;
  #pressed = false;
  readonly #ring = new FocusRing();
  /** The value as drawn: eases between notches, the stored one does not. */
  readonly #tween: ValueTween | null = null;
  #tickId = 0;

  constructor(props: MSliderProps = {}) {
    const { mode = 'standard', stopIndicators, ...rest } = props;

    super(rest);

    // The wheel moves by `page_increment`, the arrows by `step_increment`.
    // Astal's slider leaves page at 0.01, which is finer than any sane step:
    // a tick then rounds back to where it was and the wheel looks dead. One
    // tick should mean one step.
    this.set_increments(this.get_step(), this.get_step());

    this.add_css_class('plain-slider');
    this.mode = mode;
    this.stopIndicators = stopIndicators ?? false;

    this.#tween = new ValueTween(
      this.get_value(),
      this.get_max() - this.get_min(),
    );
    enforceStepGrid(this, {
      onValueChanged: () => this.#followValue(),
      onCleanup: (dispose) => this.#cleanups.push(dispose),
    });
    this.#watchDrag();
    this.#cleanups.push(
      wireFocusRing(this, this.#ring, () => this.queue_draw()),
    );

    this.connect('destroy', () => {
      if (this.#tickId !== 0) {
        this.remove_tick_callback(this.#tickId);
        this.#tickId = 0;
      }

      for (const cleanup of this.#cleanups.splice(0)) {
        cleanup();
      }
    });
  }

  // --- drag hooks --------------------------------------------------------

  /**
   * A drag began: the pointer left the tap zone.
   *
   * Emitted after GTK has already applied the first step of the drag, so a
   * listener cannot prevent that step - it observes the interaction, it does
   * not own it. A plain tap never fires this, only a real drag.
   */
  @signal()
  dragStart(): void {}

  /** A drag ended or was cancelled. Always paired with a `drag-start`. */
  @signal()
  dragEnd(): void {}

  // --- GTK hooks ---------------------------------------------------------

  /** Every selection - drag, wheel, keys - arrives here; see applyChangeValue. */
  vfunc_change_value(_scroll: Gtk.ScrollType, value: number): boolean {
    return applyChangeValue(this, value);
  }

  /** The layout for the current value and state. */
  #layout(boxes: TrackBoxes) {
    return trackLayout(boxes, {
      mode: this.mode,
      pressed: this.#pressed,
      stopIndicators: this.stopIndicators,
      value: this.#tween?.value ?? this.get_value(),
      min: this.get_min(),
      max: this.get_max(),
    });
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot) {
    const boxes = this.#boxes();

    if (!boxes) {
      return;
    }

    // The trough's own `color` from CSS is the unfilled track. The stop on
    // that side needs a contrasting color instead - see #stopColor.
    const inactive = this.#parts?.trough.get_color() ?? this.get_color();

    const layout = this.#layout(boxes);

    paintM3(snapshot, {
      layout,
      active: this.get_color(),
      inactive,
      inactiveStop: this.#stopColor(inactive),
    } satisfies M3Paint);

    // The ring is drawn last, over the track: it wraps the handle, and the
    // handle is the topmost thing the slider paints.
    paintFocusRing(
      snapshot,
      {
        x: layout.handleX,
        centerY: layout.centerY,
        handleWidth: layout.handleWidth,
        handleHeight: layout.handleHeight,
      },
      this.#ring.width,
      this.#parts?.handle.get_color() ?? this.get_color(),
    );
  }

  /**
   * The dot on the unfilled end. GTK cannot hand a custom property to GJS, so
   * the color is derived from the track: a fixed mix toward the widget's own
   * text color keeps the dot visible whatever the palette does.
   */
  #stopColor(track: Gdk.RGBA): Gdk.RGBA {
    const text = this.get_color();

    return new Gdk.RGBA({
      red: track.red + (text.red - track.red) * 0.65,
      green: track.green + (text.green - track.green) * 0.65,
      blue: track.blue + (text.blue - track.blue) * 0.65,
      alpha: Math.max(track.alpha, 0.75),
    });
  }

  /**
   * Ease the drawn handle toward the new value.
   *
   * A drag is followed at once, so the handle stays under the pointer; every
   * other change eases, so a coarse step slides instead of jumping.
   */
  #followValue() {
    const tween = this.#tween;

    if (!tween) {
      return;
    }

    tween.retarget(this.get_value());
    this.queue_draw();

    if (this.#tickId !== 0 || tween.atRest) {
      return;
    }

    tween.restartClock();
    this.#tickId = this.add_tick_callback(
      (_widget: Gtk.Widget, clock: Gdk.FrameClock) => {
        tween.step(clock.get_frame_time());
        this.queue_draw();

        if (tween.atRest) {
          this.#tickId = 0;
          return false;
        }

        return true;
      },
    );
  }

  /**
   * The spec thickens the handle to 2 px while it is held. "Held" means a real
   * drag: a tap only rewinds, and firing drag-start for it would make the
   * thickening look random. The threshold lives in wireDrag.
   */
  #watchDrag() {
    this.#cleanups.push(
      wireDrag(this, {
        onStart: () => {
          this.#setPressed(true);
          this.dragStart();
        },
        onEnd: () => {
          this.#setPressed(false);
          this.dragEnd();
        },
      }),
    );
  }

  #setPressed(pressed: boolean) {
    if (this.#pressed === pressed) {
      return;
    }

    this.#pressed = pressed;
    this.queue_draw();
  }

  #boxes(): TrackBoxes | null {
    this.#parts = currentParts(this, this.#parts);

    return this.#parts ? partsBoxes(this, this.#parts) : null;
  }
}
