// GTK has no animatable size: a widget's size is exactly what it measures. So
// this container measures its child and then reports a size of its own that
// eases towards the child's natural one; the child keeps its natural size and
// the surplus is clipped while the size moves.
//
// A Gtk.Widget, not a Gtk.Box: with a layout manager set, gtk_widget_measure
// calls the manager and never the widget's own vfunc, so a Box subclass would
// lose the whole point of this class.
import {
  DURATION,
  type Easing,
  easingOf,
  type MotionProps,
  splitMotionProps,
} from '@lib/motion';
import {
  getter,
  type ParamFlags,
  ParamSpec,
  register,
  setter,
} from 'ags/gobject';
import { type Gdk, Gtk } from 'ags/gtk4';
import type GObject from 'gi://GObject';

const DEFAULT_DURATION = DURATION.short3;

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

export interface MAnimatedContainerProps
  extends Partial<Gtk.Widget.ConstructorProps>, MotionProps {
  transition_duration?: number;
}

/**
 * Container that follows the size of its content smoothly instead of jumping
 * when the content changes. Wraps a single child; nobody lays it out but
 * itself - the child is measured and allocated by hand, as in MRevealer.
 */
@register({
  GTypeName: 'MAnimatedContainer',
  Implements: [Gtk.Buildable],
})
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

  @getter(durationSpec)
  get transitionDuration() {
    return this.ms ?? DEFAULT_DURATION;
  }

  @setter(durationSpec)
  set transitionDuration(ms: number) {
    this.ms = ms;
  }

  /** Curve chosen by the caller; `null` means the directional default. */
  readonly #easing: Easing | null;

  constructor(props: MAnimatedContainerProps = {}) {
    const { gtkProps, easing } = splitMotionProps(props);

    super(gtkProps);

    this.#easing = easing;

    // The child is allocated at its natural size: while the container
    // collapses that is larger than the box we were given.
    this.set_overflow(Gtk.Overflow.HIDDEN);
  }

  /**
   * Gtk.Widget has no child slot, so gnim cannot replace a child in this
   * container by itself: `append` would add a second one (the first stays
   * parented and never gets allocated) and `remove` throws. One slot instead.
   *
   * JSX adds through the Buildable vfunc, the same place
   * gtk_revealer_buildable_add_child overrides in GTK.
   */
  vfunc_add_child(
    _builder: Gtk.Builder,
    child: GObject.Object,
    type: string | null,
  ) {
    if (!(child instanceof Gtk.Widget)) {
      return super.vfunc_add_child(_builder, child, type);
    }

    // A widget belongs to one parent: a child arriving while the slot is taken
    // is a second child in the same JSX. Keep the newcomer, as
    // gtk_revealer_set_child does, but say so - silently loses a widget.
    if (this.get_first_child()) {
      console.warn(
        'MAnimatedContainer takes one child: a second one replaces the first',
      );
    }

    this.set_child(child);
  }

  /** Replacement path: gnim calls this to clear the slot. */
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
   * The curve is resolved from the same pair the loop will use, otherwise the
   * re-aim and the motion that follows it would not agree.
   */
  #reaim(tween: Tween, target: number) {
    const easing = easingOf(this.#easing, tween.from, target);
    const eased = easing(this.#progress);
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
        this.#progress = progress;

        for (const tween of [this.#width, this.#height]) {
          // Per axis: the two can move in opposite directions, and M3 gives
          // growth and shrink different curves.
          const easing = easingOf(this.#easing, tween.from, tween.target);
          tween.current =
            progress === 1
              ? tween.target
              : tween.from + (tween.target - tween.from) * easing(progress);
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
