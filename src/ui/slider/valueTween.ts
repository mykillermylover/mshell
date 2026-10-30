// A value that chases its target, for drawing only.
//
// The slider's real value snaps to the step grid at once - that is the model,
// and nothing about it should lag. What lags is the drawn handle: with a
// coarse step it would jump from notch to notch, so the painter is fed a
// chasing copy instead.
//
// The chase closes the gap at a fixed rate rather than interpolating over a
// fixed time. A drag retargets on every pointer move, and a time-based tween
// would restart its clock each time and freeze at the start; a fixed rate
// simply keeps closing whatever gap the target leaves.
//
// GTK has this built in (`gtk_adjustment_animate_to_value`, used by
// gtk_range_real_change_value), but that function is not exposed to GJS and
// the handler it lives in is replaced by the slider anyway.
/**
 * How long the drawn value takes to cross the whole range, ms: a tenth of the
 * range takes a tenth of the time. Constant speed is what keeps a
 * continuously retargeted drag smooth.
 */
export const CHASE_DURATION = 150;

export class ValueTween {
  /** The value to draw. */
  value: number;
  #target: number;
  /**
   * Previous frame time, µs. `null` until the first tick: a frame clock may
   * legitimately report 0, so 0 cannot double as "no previous frame".
   */
  #last: number | null = null;
  /** Units of value per second the drawn value closes at. */
  #rate: number;

  /**
   * `span` is the value range the widget covers: it turns CHASE_DURATION into
   * a rate, so the feel is the same whatever the min..max is.
   */
  constructor(value: number, span = 1) {
    this.value = value;
    this.#target = value;
    this.#rate = Math.abs(span) / (CHASE_DURATION / 1000);
  }

  /** Whether the drawn value has caught up with the real one. */
  get atRest() {
    return this.value === this.#target;
  }

  /** Aim at a new value; the drawn one closes the gap on later frames. */
  retarget(target: number) {
    this.#target = target;
  }

  /**
   * Advance to `now` (µs, Gdk.FrameClock) and return the value to draw.
   *
   * The first call only opens the interval: with no previous frame there is
   * no elapsed time to move over.
   */
  step(now: number): number {
    if (this.value === this.#target) {
      return this.value;
    }

    if (this.#last === null) {
      this.#last = now;
      return this.value;
    }

    const dt = (now - this.#last) / 1e6;
    this.#last = now;

    const gap = this.#target - this.value;
    const move = this.#rate * dt;

    this.value =
      Math.abs(gap) <= move ? this.#target : this.value + Math.sign(gap) * move;

    return this.value;
  }

  /** Forget the previous frame; the next step starts a fresh interval. */
  restartClock() {
    this.#last = null;
  }
}
