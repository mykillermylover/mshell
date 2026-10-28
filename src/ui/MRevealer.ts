// Gtk.Revealer rounds its animated size UP (ceil in gtk_revealer_measure).
// Two revealers animating in opposite directions therefore both round their
// remainder up near the ends and the sum gains a stray +1 px. Here the growing
// side rounds to nearest and the collapsing side floors, so the remainder is
// dropped instead of added; the child is always allocated at its natural size.
import { type Gdk, Gtk } from 'ags/gtk4';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import { register } from 'gnim/gobject';

const {
  NONE: NO_TRANSITION,
  SLIDE_UP,
  SLIDE_DOWN,
  SLIDE_LEFT,
  SLIDE_RIGHT,
  FADE_SLIDE_UP,
  FADE_SLIDE_DOWN,
  FADE_SLIDE_LEFT,
  FADE_SLIDE_RIGHT,
  SWING_UP,
  SWING_DOWN,
  SWING_RIGHT,
} = Gtk.RevealerTransitionType;

/** GtkProgressTracker's easing: the same curve Gtk.Revealer animates with. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const SLIDING = new Set([
  SLIDE_UP,
  SLIDE_DOWN,
  SLIDE_LEFT,
  SLIDE_RIGHT,
  FADE_SLIDE_UP,
  FADE_SLIDE_DOWN,
  FADE_SLIDE_LEFT,
  FADE_SLIDE_RIGHT,
]);

const VERTICAL = new Set([
  SLIDE_UP,
  SLIDE_DOWN,
  FADE_SLIDE_UP,
  FADE_SLIDE_DOWN,
  SWING_UP,
  SWING_DOWN,
]);

const BOTTOM = new Set([SLIDE_DOWN, FADE_SLIDE_DOWN, SWING_DOWN]);
const RIGHT = new Set([SLIDE_RIGHT, FADE_SLIDE_RIGHT, SWING_RIGHT]);

/** These transitions keep their size, so there is nothing for us to animate. */
const INSTANT = new Set([NO_TRANSITION, Gtk.RevealerTransitionType.CROSSFADE]);

export interface MRevealerProps {
  transitionType?: Gtk.RevealerTransitionType;
  revealChild?: boolean;
  transitionDuration?: number;
}

/**
 * Revealer with an exact size. Everything else stays Gtk.Revealer: every
 * property and signal is inherited and keeps working, because only the size
 * measurement is overridden.
 *
 * Supported transitions: SLIDE_* and FADE_SLIDE_* animate the size; NONE and
 * CROSSFADE keep it (the base class fades instead); SWING_* is not supported -
 * it needs the perspective rotation of the base allocation.
 */
@register({ GTypeName: 'MRevealer' })
export class MRevealer extends Gtk.Revealer {
  /** Eased position: 0 hidden, 1 revealed. */
  #position = 0;
  #from = 0;
  #to = 0;
  #startedAt: number | null = null;
  #tickId = 0;

  constructor(props: MRevealerProps = {}) {
    super(props);
    // A revealer built already revealed starts there: no animation to play.
    this.#position = props.revealChild ? 1 : 0;
    this.#from = this.#position;
    this.#to = this.#position;

    this.connect('notify::reveal-child', () => {
      this.#animate(this.revealChild ? 1 : 0);
    });
  }

  vfunc_measure(
    orientation: Gtk.Orientation,
    forSize: number,
  ): [number, number, number, number] {
    // Crossfade and no-transition keep their size; only slides animate it.
    const sliding = SLIDING.has(this.transitionType);
    const position = sliding ? this.#position : 1;
    const scale = this.#isAxis(orientation) ? position : 1;
    // The cross axis keeps its size, so the child is measured through the
    // scaled axis size, exactly as gtk_revealer_measure does.
    const opposite = this.#isAxis(orientation) ? 1 : position;

    if (scale === 0) {
      return [0, 0, -1, -1];
    }

    const request =
      forSize < 0 || opposite === 0 ? -1 : Math.floor(forSize / opposite);
    const [min, natural] = this.#measureChild(orientation, request);

    if (scale === 1) {
      return [min, natural, -1, -1];
    }

    const round = this.revealChild ? Math.round : Math.floor;

    return [round(min * scale), round(natural * scale), -1, -1];
  }

  vfunc_size_allocate(width: number, height: number, baseline: number) {
    const child = this.get_child();

    if (!child || !child.get_visible()) {
      return;
    }

    // The child keeps its natural size and is only clipped by our allocation,
    // so a fractional progress never squeezes the content. measure() answers
    // [minimum, natural, ...] - the natural size is the second one.
    const [, naturalWidth] = this.#measureChild(Gtk.Orientation.HORIZONTAL, -1);
    const [, naturalHeight] = this.#measureChild(Gtk.Orientation.VERTICAL, -1);
    const vertical = VERTICAL.has(this.transitionType);
    const childWidth = vertical ? width : naturalWidth;
    const childHeight = vertical ? naturalHeight : height;

    let x = 0;
    let y = 0;

    if (BOTTOM.has(this.transitionType)) {
      y = height - childHeight;
    } else if (RIGHT.has(this.transitionType)) {
      x = width - childWidth;
    }

    const transform =
      x === 0 && y === 0
        ? null
        : Gsk.Transform.new().translate(new Graphene.Point().init(x, y));

    child.allocate(childWidth, childHeight, baseline, transform);
  }

  /** Slides need clipping: the child is allocated at natural size and offset. */
  get #clips() {
    return SLIDING.has(this.transitionType);
  }

  #shouldAnimate() {
    return (
      this.get_mapped() &&
      this.transitionDuration > 0 &&
      !INSTANT.has(this.transitionType) &&
      (Gtk.Settings.get_default()?.gtkEnableAnimations ?? false) &&
      this.get_frame_clock() !== null
    );
  }

  #isAxis(orientation: Gtk.Orientation) {
    const axis = VERTICAL.has(this.transitionType)
      ? Gtk.Orientation.VERTICAL
      : Gtk.Orientation.HORIZONTAL;

    return orientation === axis;
  }

  #measureChild(orientation: Gtk.Orientation, forSize: number) {
    const child = this.get_child();

    if (!child || !child.get_visible()) {
      return [0, 0];
    }

    return child.measure(orientation, forSize);
  }

  /** Play the size transition; the base class keeps animating for `child_revealed`. */
  #animate(target: number) {
    this.#from = this.#position;
    this.#to = target;
    this.#startedAt = null;

    if (this.#tickId !== 0) {
      return;
    }
    // Same conditions as gtk_revealer_start_animation: an unmapped or
    // unanimated revealer jumps straight to the target.
    if (!this.#shouldAnimate()) {
      this.#position = target;
      this.queue_resize();
      return;
    }
    if (this.#clips) {
      this.set_overflow(Gtk.Overflow.HIDDEN);
    }

    this.#tickId = this.add_tick_callback(
      (_widget: Gtk.Widget, clock: Gdk.FrameClock) => {
        const now = clock.get_frame_time();
        this.#startedAt ??= now;

        const duration = this.transitionDuration;
        const elapsed = (now - this.#startedAt) / 1000;
        const progress = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        this.#position =
          this.#from + (this.#to - this.#from) * easeOutCubic(progress);
        this.queue_resize();

        if (progress < 1) {
          return true;
        }

        this.#position = this.#to;
        this.#tickId = 0;
        if (this.#clips) {
          this.set_overflow(Gtk.Overflow.VISIBLE);
        }
        return false;
      },
    );
  }
}
