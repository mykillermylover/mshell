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
import { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4'; // first: pins Gtk 4 before Gsk is loaded
import { property, register } from 'gnim/gobject';

import { applyVariant, type Variant } from '../variant';
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
  /** Which palette variant the filled track and the handle use. */
  variant?: Variant;
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
  @property(String)
  mode: SliderMode = 'standard';

  @property(Boolean)
  stopIndicators = false;

  readonly #cleanups: (() => void)[] = [];

  #parts: SliderParts | null = null;
  #pressed = false;
  /** The value as drawn: eases between notches, the stored one does not. */
  #tween: ValueTween | null = null;
  #tickId = 0;

  constructor(props: MSliderProps = {}) {
    const {
      mode = 'standard',
      stopIndicators,
      variant = 'primary',
      ...rest
    } = props;

    super(rest);

    // The wheel moves by `page_increment`, the arrows by `step_increment`.
    // Astal's slider leaves page at 0.01, which is finer than any sane step:
    // a tick then rounds back to where it was and the wheel looks dead. One
    // tick should mean one step.
    this.set_increments(this.get_step(), this.get_step());

    this.add_css_class('plain-slider');
    applyVariant(this, variant);
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
    this.#watchPress();

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

    paintM3(snapshot, {
      layout: this.#layout(boxes),
      active: this.get_color(),
      inactive,
      inactiveStop: this.#stopColor(inactive),
    } satisfies M3Paint);
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
   * GTK's own click gesture tells us when the handle is held, which the spec
   * turns into a 2 px handle. A press that never moves still counts as
   * pressed - the token is about the finger, not about motion.
   */
  #watchPress() {
    const controllers = this.observe_controllers();

    for (let i = 0; i < controllers.get_n_items(); i++) {
      const controller = controllers.get_item(i);

      if (!(controller instanceof Gtk.GestureClick)) {
        continue;
      }

      const pressed = controller.connect('pressed', () =>
        this.#setPressed(true),
      );
      const released = controller.connect('released', () =>
        this.#setPressed(false),
      );

      this.#cleanups.push(() => {
        controller.disconnect(pressed);
        controller.disconnect(released);
      });

      return;
    }
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
