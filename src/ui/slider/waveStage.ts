// The wave's state machine: phase, amplitude, and the eased tween between
// them. Pure numbers on a clock, no GTK - so a node test can drive it
// frame by frame and assert what the eye would see.
import { easeOutCubic } from '@lib/frame/easing';

import { FLATTEN_DURATION, WAVE_LENGTH, WAVE_SPEED } from './sliderMath';

/** A frame of the animation: what to draw, and whether to ask for another. */
export interface WaveFrame {
  /**
   * Phase of the crests, px. Runs backwards, so it stays in (-wavelength, 0]
   * (JS `%` keeps the sign) and jumps by one wavelength when it wraps. `sin`
   * does not care, but do not compare it to a positive range.
   */
  phase: number;
  /** How wavy the track is right now, 0 (flat) .. 1 (full amplitude). */
  level: number;
  /** `true` while anything is still moving, `false` once it has settled. */
  alive: boolean;
}

/**
 * The wave as a small state machine.
 *
 * `amplitude` is the full displacement in px; `speed` is how fast the crests
 * travel. Both come from the widget, so this class knows nothing about where
 * they are configured.
 *
 * The tween retargets from wherever the amplitude currently is, so the mode
 * can flip mid-transition (pressed while flattening, released while rising)
 * without a jump.
 */
export class WaveStage {
  readonly #speed: number;
  readonly #amplitude: number;

  /** Distance traveled, px. Wraps at one wavelength. */
  #phase = 0;
  /** Current level, 0..1. */
  #level = 0;
  /** Where the running tween started, where it aims, and when it began. */
  #from = 0;
  #to = 0;
  #startedAt: number | null = null;
  /** Previous frame time, µs; 0 means this is the first frame. */
  #last = 0;
  /** The most recent frame, so a repaint between ticks still has values. */
  #frame: WaveFrame = { phase: 0, level: 0, alive: false };

  constructor(speed = WAVE_SPEED, amplitude = 1) {
    this.#speed = speed;
    this.#amplitude = amplitude;
  }

  /** Full displacement of the crests at `level = 1`, px. */
  get amplitude() {
    return this.#amplitude;
  }

  /** Whether the stage is fully settled and needs no more frames. */
  get atRest() {
    return this.#level === 0 && this.#to === 0;
  }

  /** The last computed frame; valid before the first tick too. */
  get frame(): WaveFrame {
    return this.#frame;
  }

  /** Aim at a new level; a no-op when the target is already current. */
  retarget(target: 0 | 1) {
    if (target === this.#to) {
      return;
    }

    this.#from = this.#level;
    this.#to = target;
    this.#startedAt = null;
  }

  /**
   * Advance to `now` (µs from the frame clock) and report the frame to draw.
   *
   * `travel` says whether the crests should move: on pause they stop dead
   * while the amplitude keeps easing out, which is what makes the flatten
   * look like a wave laying itself down rather than a cut.
   */
  tick(now: number, travel: boolean): WaveFrame {
    const dt = this.#last === 0 ? 0 : (now - this.#last) / 1e6;
    this.#last = now;

    if (travel) {
      // Minus, not plus: the sine is sin(k·(x − phase)), so a growing phase
      // would drag the crests to the right, along the progress. They run
      // against it.
      this.#phase = (this.#phase - this.#speed * dt) % WAVE_LENGTH;
    }

    if (this.#level !== this.#to) {
      this.#startedAt ??= now;

      const elapsed = (now - this.#startedAt) / 1000;
      const progress = Math.min(1, elapsed / FLATTEN_DURATION);

      this.#level =
        this.#from + (this.#to - this.#from) * easeOutCubic(progress);

      if (progress === 1) {
        this.#level = this.#to;
        this.#startedAt = null;
      }
    }

    this.#frame = {
      phase: this.#phase,
      level: this.#level,
      alive: travel || this.#level !== this.#to || this.#level !== 0,
    };

    return this.#frame;
  }

  /** Forget the last frame time; the next tick starts a fresh interval. */
  restartClock() {
    this.#last = 0;
  }
}
