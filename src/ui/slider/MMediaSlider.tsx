// The media playhead: an Astal slider that draws its own track, with a
// running sine in the active part.
//
// Nothing of the native painting survives: overriding vfunc_snapshot replaces
// it wholesale (verified against GTK 4.22 - chaining to super draws nothing),
// which is why the CSS hides the native parts and this widget paints them.
//
// The work is split out: waveStage owns the animation, trackLayout the
// geometry, trackPainter the Gsk nodes, sliderParts the GTK children and
// stepGrid the snapping. This class only wires them together.

import type { Point } from '@lib/geometry';
import { Accessor } from 'ags';
import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4'; // first: pins Gtk 4 before Gsk is loaded
import { property, register } from 'gnim/gobject';

import { applyVariant, type Variant } from '../variant';
import { DRAG_THRESHOLD, WAVE_AMPLITUDE, WAVE_SPEED } from './sliderMath';
import { currentParts, partsBoxes, type SliderParts } from './sliderParts';
import { applyChangeValue, enforceStepGrid } from './stepGrid';
import { trackLayout } from './trackLayout';
import { paintTrack } from './trackPainter';
import { WaveStage } from './waveStage';

/** The native slider this one extends; a value, so it has to come at runtime. */
const AstalSlider = Astal.Slider;

export interface MMediaSliderProps extends Partial<Astal.Slider.ConstructorProps> {
  /** Whether the track is playing: the crests run only then. */
  playing?: boolean | Accessor<boolean>;
  /** Travel speed of the crests, px/s. */
  waveSpeed?: number;
  /** Peak displacement of the crests, px. */
  waveAmplitude?: number;
  /** Which palette variant the track uses. */
  variant?: Variant;
}

/**
 * The playhead of a media player.
 *
 * The wave is the widget's whole point, so there is no switch to turn it off.
 * It flattens while the handle is held - a drag is a deliberate act, the wave
 * is decoration - and a plain tap that only rewinds leaves it running: the
 * phase is a function of x, never of the value.
 */
@register({ GTypeName: 'MMediaSlider' })
export default class MMediaSlider extends AstalSlider {
  // Not `declare`: gnim's @property keeps the value in private storage and
  // the initializer runs right after super(); the constructor then stores the
  // real one. `declare` would trip TS1206 on the decorator.
  @property(Boolean)
  playing = false;

  readonly #stage: WaveStage;
  #parts: SliderParts | null = null;
  #dragging = false;
  /** Cached drag gesture; `undefined` means "not looked up yet". */
  #drag: Gtk.GestureDrag | null | undefined = undefined;
  #tickId = 0;
  /** Teardown callbacks: signal ids and subscription disposers. */
  readonly #cleanups: (() => void)[] = [];

  readonly #buffer: Point[] = [];

  constructor(props: MMediaSliderProps = {}) {
    const {
      playing,
      waveSpeed = WAVE_SPEED,
      waveAmplitude = WAVE_AMPLITUDE,
      variant = 'primary',
      ...rest
    } = props;

    super(rest);

    // CSS names the slider's own parts; see styles/ui/_media-slider.scss.
    this.add_css_class('media-slider');
    applyVariant(this, variant);

    this.#stage = new WaveStage(waveSpeed, waveAmplitude);

    this.#followPlaying(playing);
    enforceStepGrid(this, {
      onValueChanged: () => this.queue_draw(),
      onCleanup: (dispose) => this.#cleanups.push(dispose),
    });
    this.#wireDrag();

    this.connect('destroy', () => this.#teardown());

    // The initial state counts: a slider born while playing must wave at once.
    this.#requestFrame();
  }

  // --- GTK hooks ---------------------------------------------------------

  /** Every selection - drag, wheel, keys - arrives here; see applyChangeValue. */
  vfunc_change_value(_scroll: Gtk.ScrollType, value: number): boolean {
    return applyChangeValue(this, value);
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot) {
    this.#parts = currentParts(this, this.#parts);

    const parts = this.#parts;

    if (!parts) {
      return;
    }

    const boxes = partsBoxes(this, parts);

    if (!boxes) {
      return;
    }

    paintTrack(
      snapshot,
      {
        layout: trackLayout(boxes),
        amplitude: this.#stage.amplitude * this.#level,
        phase: this.#phase,
        active: this.get_color(),
        inactive: parts.trough.get_color(),
      },
      this.#buffer,
    );
  }

  // --- wiring ------------------------------------------------------------

  /**
   * `playing` is a plain GObject property, so the widget can be driven from
   * outside either as a value or through an Accessor (which a media player
   * already has). Whichever arrives, it ends up in the same property.
   */
  #followPlaying(playing: MMediaSliderProps['playing']) {
    if (playing instanceof Accessor) {
      this.playing = playing.peek();

      // The Accessor belongs to the caller and outlives this widget, so the
      // subscription has to be dropped explicitly - see #teardown.
      const unsubscribe = playing.subscribe(() => {
        this.playing = playing.peek();
      });

      this.#cleanups.push(unsubscribe);
    } else {
      this.playing = playing ?? false;
    }

    this.connect('notify::playing', () => this.#requestFrame());
  }

  /**
   * The scale's own GtkGestureDrag, not a copy of its logic: GtkRange installs
   * one and claims the sequence on it, so nothing of ours would ever see the
   * events.
   *
   * The start comes from drag-update, not drag-begin: GTK has no drag
   * threshold, so drag-begin fires on the press itself - a plain tap that only
   * rewinds must not flatten the wave. The first offset past the threshold is
   * what tells a drag from a tap.
   */
  #wireDrag() {
    const drag = this.#dragGesture;

    if (!drag) {
      return;
    }

    let started = false;

    drag.connect(
      'drag-update',
      (_gesture: Gtk.GestureDrag, x: number, y: number) => {
        if (started || Math.hypot(x, y) <= DRAG_THRESHOLD) {
          return;
        }

        started = true;
        this.#dragging = true;
        this.#requestFrame();
      },
    );

    drag.connect('drag-end', () => {
      if (!started) {
        return;
      }

      started = false;
      this.#dragging = false;
      this.#requestFrame();
    });
  }

  /** The scale's own drag gesture. Resolved once: it lives as long as the widget. */
  get #dragGesture(): Gtk.GestureDrag | null {
    if (this.#drag !== undefined) {
      return this.#drag;
    }

    const controllers = this.observe_controllers();

    this.#drag = null;
    for (let i = 0; i < controllers.get_n_items(); i++) {
      const controller = controllers.get_item(i);

      if (controller instanceof Gtk.GestureDrag) {
        this.#drag = controller;
        break;
      }
    }

    return this.#drag;
  }

  // --- animation ---------------------------------------------------------

  /**
   * Whether the crests should be traveling right now: a playing track with
   * somewhere to travel. An empty range (a stream before its length is known)
   * has no fill to wave along.
   */
  get #waving() {
    return this.playing && !this.#dragging && this.get_max() > this.get_min();
  }

  /**
   * Bring the animation in line with the current state and keep frames coming
   * while there is anything left to draw. Idle sliders run no tick loop, so a
   * paused player does not wake the compositor.
   */
  #requestFrame() {
    this.queue_draw();
    this.#stage.retarget(this.#waving ? 1 : 0);

    if (this.#tickId !== 0 || this.#stage.atRest) {
      return;
    }

    this.#stage.restartClock();
    this.#tickId = this.add_tick_callback(
      (_widget: Gtk.Widget, clock: Gdk.FrameClock) => {
        const frame = this.#stage.tick(clock.get_frame_time(), this.#waving);

        this.queue_draw();

        // Returning false is the whole of the teardown: GTK destroys the
        // record itself, and removing it here as well would be a second
        // attempt to free the same object.
        if (!frame.alive) {
          this.#tickId = 0;
          return false;
        }

        return true;
      },
    );
  }

  /** Take the tick loop down from outside; the callback only ever returns false. */
  #stopTicking() {
    if (this.#tickId !== 0) {
      this.remove_tick_callback(this.#tickId);
    }

    this.#tickId = 0;
  }

  /** Drop everything that would otherwise outlive the widget. */
  #teardown() {
    this.#stopTicking();

    for (const cleanup of this.#cleanups.splice(0)) {
      cleanup();
    }
  }

  /** The frame the painter reads: phase and level of the current state. */
  get #phase() {
    return this.#stage.frame.phase;
  }

  get #level() {
    return this.#stage.frame.level;
  }
}
