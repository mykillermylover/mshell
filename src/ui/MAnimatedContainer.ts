// GTK has no animatable size: a widget's size is exactly what it measures. So
// this container measures its child and then reports a size of its own that
// eases towards the child's natural one; the child keeps its natural size and
// the surplus is clipped while the size moves.
//
// A Gtk.Widget, not a Gtk.Box: with a layout manager set, gtk_widget_measure
// calls the manager and never the widget's own vfunc, so a Box subclass would
// lose the whole point of this class.
import { type Gdk, Gtk } from 'ags/gtk4';
import Adw from 'gi://Adw';
import {
  getter,
  type ParamFlags,
  ParamSpec,
  register,
  setter,
} from 'gnim/gobject';

const DEFAULT_DURATION = 150;
/** The curve Gtk.Revealer animates with: same feel as the pop revealers. */
const DEFAULT_EASING = Adw.Easing.EASE_OUT_CUBIC;

const durationSpec = (name: string, flags: ParamFlags) =>
  ParamSpec.uint(
    name,
    'transition-duration',
    'Size transition duration, ms',
    flags,
    0,
    10_000,
    DEFAULT_DURATION,
  );

/** One axis: what the parent sees, where it settles, and where the move began. */
interface Tween {
  current: number;
  target: number;
  from: number;
  /** The first measure only sizes the axis, it does not animate from 0. */
  started: boolean;
}

const tween = (): Tween => ({ current: 0, target: 0, from: 0, started: false });

const easingSpec = (name: string, flags: ParamFlags) =>
  ParamSpec.enum(
    name,
    'transition-type',
    'Size transition easing (Adw.Easing)',
    flags,
    Adw.Easing.$gtype,
    DEFAULT_EASING,
  );

export interface MAnimatedContainerProps extends Partial<Gtk.Widget.ConstructorProps> {
  transitionDuration?: number;
  transition_duration?: number;
  transitionType?: Adw.Easing;
  transition_type?: Adw.Easing;
}

/**
 * Container that follows the size of its content smoothly instead of jumping
 * when the content changes. Wraps a single child; nobody lays it out but
 * itself - the child is measured and allocated by hand, as in MRevealer.
 */
@register({ GTypeName: 'MAnimatedContainer' })
export class MAnimatedContainer extends Gtk.Widget {
  #width = tween();
  #height = tween();

  #startedAt: number | null = null;
  /** Linear progress of the running tween: a retarget re-aims from it. */
  #progress = 0;
  #tickId = 0;

  // `declare`: a real field would be initialized after GObject has applied the
  // constructor properties and would overwrite the value passed in.
  declare private ms: number | undefined;
  declare private easing: Adw.Easing | undefined;

  @getter(durationSpec)
  get transitionDuration() {
    return this.ms ?? DEFAULT_DURATION;
  }

  @setter(durationSpec)
  set transitionDuration(ms: number) {
    this.ms = ms;
  }

  /** Any Adw.Easing: EASE_OUT/IN_OUT mirror the CSS keywords, EASE_OUT_BACK overshoots. */
  @getter(easingSpec)
  get transitionType() {
    return this.easing ?? DEFAULT_EASING;
  }

  @setter(easingSpec)
  set transitionType(type: Adw.Easing) {
    this.easing = type;
  }

  constructor(props: MAnimatedContainerProps = {}) {
    super(props);

    // The child is allocated at its natural size: while the container
    // collapses that is larger than the box we were given.
    this.set_overflow(Gtk.Overflow.HIDDEN);
  }

  /**
   * Gtk.Widget has no child slot, so gnim cannot replace a child in this
   * container by itself: `append` would add a second one (the first stays
   * parented and never gets allocated) and `remove` throws. One slot instead.
   */
  set_child(child: Gtk.Widget | null) {
    const current = this.get_first_child();

    if (current === child) {
      return;
    }

    // Both queue a resize on us themselves.
    current?.unparent();
    child?.set_parent(this);
  }

  vfunc_measure(
    orientation: Gtk.Orientation,
    forSize: number,
  ): [number, number, number, number] {
    const child = this.get_first_child();
    const [, natural] =
      child && child.get_visible()
        ? child.measure(orientation, forSize)
        : [0, 0];

    const tween = this.#axis(orientation);
    this.#retarget(tween, natural);

    const size = Math.round(tween.current);

    // The animated size is the minimum as well: the parent must be free to
    // allocate less than the content while the container collapses.
    return [size, size, -1, -1];
  }

  vfunc_size_allocate(width: number, height: number, baseline: number) {
    const child = this.get_first_child();

    if (!child || !child.get_visible()) {
      return;
    }

    // The child keeps its natural size, so the content never squeezes, but the
    // axis we do not animate is ours to hand out - otherwise an expanding
    // child never gets more than its natural width.
    child.allocate(
      Math.max(this.#width.target, width),
      Math.max(this.#height.target, height),
      baseline,
      null,
    );
  }

  #axis(orientation: Gtk.Orientation) {
    return orientation === Gtk.Orientation.HORIZONTAL
      ? this.#width
      : this.#height;
  }

  /** A new content size: snap the first time, animate every time after. */
  #retarget(tween: Tween, natural: number) {
    if (natural === tween.target) {
      return;
    }

    if (!tween.started) {
      tween.started = true;
      tween.current = natural;
      tween.target = natural;
      return;
    }

    const running = this.#tickId !== 0;

    if (running) {
      // The running tween picks the new target up without restarting: a child
      // animating its own CSS (padding) moves the target every single frame,
      // and restarting per frame froze the curve and stepped instead.
      this.#reaim(tween, natural);
    }

    tween.target = natural;

    if (!running) {
      this.#start();
    }
  }

  /**
   * Keep the current size while aiming elsewhere: solve `from` so that
   * `from + (target - from) * eased(progress)` stays where the axis is now.
   * Near the end of the curve the remainder is negligible - restart instead.
   * `abs`: overshooting easings (EASE_OUT_BACK) cross 1 in the middle.
   */
  #reaim(tween: Tween, target: number) {
    const eased = Adw.easing_ease(this.transitionType, this.#progress);
    const left = 1 - eased;

    tween.from =
      Math.abs(left) > 0.05
        ? (tween.current - target * eased) / left
        : tween.current;
  }

  #shouldAnimate() {
    return (
      this.transitionDuration > 0 &&
      this.get_mapped() &&
      (Gtk.Settings.get_default()?.gtkEnableAnimations ?? false) &&
      this.get_frame_clock() !== null
    );
  }

  #start() {
    // An axis that did not change eases from its target to itself.
    for (const tween of [this.#width, this.#height]) {
      tween.from = tween.current;
    }

    if (!this.#shouldAnimate()) {
      for (const tween of [this.#width, this.#height]) {
        tween.current = tween.target;
      }
      return;
    }

    this.#startedAt = null;
    this.#progress = 0;
    this.#tickId = this.add_tick_callback(
      (_widget: Gtk.Widget, clock: Gdk.FrameClock) => {
        const now = clock.get_frame_time();
        this.#startedAt ??= now;

        const elapsed = (now - this.#startedAt) / 1000;
        const progress = Math.min(1, elapsed / this.transitionDuration);
        const eased = Adw.easing_ease(this.transitionType, progress);
        this.#progress = progress;

        for (const tween of [this.#width, this.#height]) {
          tween.current =
            progress === 1
              ? tween.target
              : tween.from + (tween.target - tween.from) * eased;
        }

        this.queue_resize();

        if (progress < 1) {
          return true;
        }

        this.#tickId = 0;
        return false;
      },
    );
  }
}
