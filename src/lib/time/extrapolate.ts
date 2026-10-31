// Extrapolation: a value that keeps moving between the reports that arrive
// for it. A media player is the obvious case - MPRIS reports a position about
// once a second while the track advances continuously, so a playhead drawn
// from the reports alone stands still and jumps a second's worth at a time.
//
// The idea is a speed and a base: the last reported value, plus how fast it is
// assumed to keep going. Every report updates the value, and either supplies
// the speed or lets it be inferred from the reports themselves.
//
// The arithmetic is here, without GJS or gnim, so it is tested in node; the
// live wrapper is `createExtrapolated` in time/extrapolated.ts.

/** What the caller reports: a fresh value, and optionally how fast it moves. */
export interface Reading {
  value: number;
  /**
   * Units per second after this reading. Omit it to let the speed be inferred
   * from consecutive reports; `0` freezes the value until the next one.
   */
  rate?: number;
}

/** How a reading turns into the value at a given moment. */
export interface Extrapolation {
  /** The reported value, the base the estimate moves from. */
  value: number;
  /** Units per second to keep moving at. */
  rate: number;
  /** When the reading arrived, ms - the same base the caller's clock uses. */
  at: number;
  /**
   * How far past the reading the estimate may run, ms - one observed reporting
   * interval. Past it the value stops: reports have stopped coming, so the
   * source stopped moving.
   */
  horizon: number;
}

/**
 * A reporting interval longer than this is not a cadence, it is a gap: a
 * pause, a seek, or a player that only talks when it feels like it. Such a
 * pair says nothing about how fast the value moves.
 */
export const MAX_INFER_GAP_MS = 3000;

/** The interval to assume for the very first report, ms. */
export const DEFAULT_HORIZON = 1000;

/**
 * The speed implied by two consecutive reports.
 *
 * `null` when there is no usable pair: the first report, a repeat with no
 * time passed, a value going backwards (a seek), or a gap too long to be
 * ordinary playback.
 */
export function inferredRate(
  previous: Extrapolation | null,
  value: number,
  at: number,
): number | null {
  if (!previous) {
    return null;
  }

  const elapsed = at - previous.at;

  if (elapsed <= 0 || elapsed > MAX_INFER_GAP_MS || value < previous.value) {
    return null;
  }

  return ((value - previous.value) * 1000) / elapsed;
}

/**
 * Apply a new report to a running estimate.
 *
 * An explicit `rate` wins; otherwise the speed is inferred from the previous
 * report, and a report that cannot be inferred from keeps the speed it had
 * when it still made sense (a value going backwards slides back at the same
 * speed rather than stopping dead).
 */
export function applyReading(
  previous: Extrapolation | null,
  reading: Reading,
  at: number,
): Extrapolation {
  const elapsed = previous ? at - previous.at : 0;

  return {
    value: reading.value,
    rate: nextRate(previous, reading, at),
    at,
    horizon: nextHorizon(previous, elapsed),
  };
}

/** One observed interval is also the horizon: past it the source stopped reporting. */
function nextHorizon(previous: Extrapolation | null, elapsed: number): number {
  const usableGap = elapsed > 0 && elapsed <= MAX_INFER_GAP_MS;

  if (previous && usableGap) {
    return elapsed;
  }

  return previous?.horizon ?? DEFAULT_HORIZON;
}

/**
 * The speed to keep moving at after this report.
 *
 * In order of preference: what the caller stated, what the pair of reports
 * implies, then - when neither is usable - whatever it was before. That last
 * case is a value going backwards, a seek: the jump says nothing about speed,
 * but the source has not necessarily stopped, so the old speed carries over.
 */
function nextRate(
  previous: Extrapolation | null,
  reading: Reading,
  at: number,
): number {
  if (reading.rate !== undefined) {
    return reading.rate;
  }

  const inferred = inferredRate(previous, reading.value, at);

  if (inferred !== null) {
    return inferred;
  }

  const wentBackwards = reading.value < (previous?.value ?? reading.value);

  if (wentBackwards) {
    return previous?.rate ?? 0;
  }

  return 0;
}

/**
 * The value `nowMs` after its reading arrived.
 *
 * Past `horizon` the value stops: reports have stopped coming, so there is
 * nothing to keep moving toward. That is what makes a pause stand still
 * without anyone saying "paused" - a playing source keeps sending reports and
 * the horizon keeps sliding forward with each one.
 *
 * No ceiling on top of that: an "upper bound" is the caller's business, and it
 * clamps the value it gets.
 */
export function extrapolate(
  { value, rate, at, horizon }: Extrapolation,
  nowMs: number,
): number {
  const elapsed = Math.min(nowMs - at, horizon);

  return value + (rate * elapsed) / 1000;
}
