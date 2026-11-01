// Material 3 motion for widgets that drive their own frame clock.
//
// The CSS side lives in styles/_motion.scss. A widget that animates in a
// tick_callback cannot use a CSS transition, so the same curves are here as
// progress functions and the same durations as numbers. Both sets are exported
// whole, so a component can take a token name instead of a magic number.
//
// Objects rather than TypeScript enums: an enum would add a reverse mapping and
// lose the literal key names, and `keyof typeof` already gives the union of
// names that the props want.

/** md-sys-motion durations, ms. */
export const DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800,
  extraLong3: 900,
  extraLong4: 1000,
} as const;

/** Any md-sys-motion duration name. */
export type DurationName = keyof typeof DURATION;

/** A duration token, or raw milliseconds - for one-off values the scale lacks. */
export type Duration = DurationName | number;

/**
 * Turns a duration token name into milliseconds, leaving a number untouched.
 * `undefined` stays `undefined`: a widget that has its own default must be able
 * to tell "not given" from "given as 0".
 */
export const resolveDuration = (value?: Duration): number | undefined =>
  typeof value === 'string' ? DURATION[value] : value;

/** Maps linear progress 0..1 to eased progress. */
export type Easing = (t: number) => number;

/** One coordinate of the cubic, with P0 = 0 and P3 = 1. */
const at = (a1: number, a2: number, t: number) => {
  const u = 1 - t;

  return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t;
};

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` as a progress function.
 *
 * The curve is parametric: linear progress runs along x, the eased value along
 * y. CSS resolves x -> t numerically, and so does this - bisect t until the
 * curve's x matches the requested progress, then read y at that t. Bisection
 * rather than Newton: it cannot diverge on the flat control points M3 uses,
 * and 30 halvings are far below a pixel even at 60 fps.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Easing {
  return (x: number) => {
    if (x <= 0) {
      return 0;
    }
    if (x >= 1) {
      return 1;
    }

    let lo = 0;
    let hi = 1;

    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;

      if (at(x1, x2, mid) < x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return at(y1, y2, (lo + hi) / 2);
  };
}

/**
 * md-sys-motion easings. `emphasized` and `standard` are the same curve in this
 * token version - the names are kept because call sites mean different things.
 */
export const EASING = {
  emphasized: cubicBezier(0.2, 0, 0, 1),
  emphasizedAccelerate: cubicBezier(0.3, 0, 0.8, 0.15),
  emphasizedDecelerate: cubicBezier(0.05, 0.7, 0.1, 1),
  standard: cubicBezier(0.2, 0, 0, 1),
  standardAccelerate: cubicBezier(0.3, 0, 1, 1),
  standardDecelerate: cubicBezier(0, 0, 0, 1),
  legacy: cubicBezier(0.4, 0, 0.2, 1),
  legacyAccelerate: cubicBezier(0.4, 0, 1, 1),
  legacyDecelerate: cubicBezier(0, 0, 0.2, 1),
  linear: cubicBezier(0, 0, 1, 1),
} as const;

/** Any md-sys-motion easing name. */
export type EasingName = keyof typeof EASING;

/** A named curve, or a curve of one's own. */
export type EasingSpec = EasingName | Easing;

export const easingEmphasizedDecelerate = EASING.emphasizedDecelerate;
export const easingEmphasizedAccelerate = EASING.emphasizedAccelerate;

/** Turns a named curve into the function itself; a function passes through. */
export const resolveEasing = (value: EasingSpec): Easing =>
  typeof value === 'function' ? value : EASING[value];

/**
 * Which curve an animation between two values takes, when the caller did not
 * choose one. Both widgets that drive their own clock animate in both
 * directions, so the rule lives here once: M3 enters with a decelerating curve
 * and leaves with an accelerating one.
 */
export const easingFor = (from: number, to: number): Easing =>
  to > from ? easingEmphasizedDecelerate : easingEmphasizedAccelerate;

/** The curve for one segment: the caller's choice, or the directional default. */
export const easingOf = (
  chosen: Easing | null,
  from: number,
  to: number,
): Easing => chosen ?? easingFor(from, to);

/** The motion props every self-animating widget accepts. */
export interface MotionProps {
  /** A motion token name (`'medium2'`), or raw milliseconds. */
  transitionDuration?: Duration;
  /**
   * Overrides the directional default. By default entering decelerates and
   * leaving accelerates, as Material 3 prescribes.
   */
  easing?: EasingSpec;
}

/**
 * Splits a widget's props into what its superclass constructor may see and the
 * curve this class keeps for itself.
 *
 * `easing` is ours alone - a GObject constructor rejects unknown keys. The
 * duration must be milliseconds by the time GObject reads it, and when the
 * caller gave none the key is left out entirely: passing `undefined` would be
 * indistinguishable from a reset, and the widget has its own default to keep.
 */
export function splitMotionProps<P extends MotionProps>(props: P) {
  const { easing, transitionDuration, ...rest } = props;
  const ms = resolveDuration(transitionDuration);

  return {
    gtkProps: ms === undefined ? rest : { ...rest, transitionDuration: ms },
    easing: easing === undefined ? null : resolveEasing(easing),
  };
}
