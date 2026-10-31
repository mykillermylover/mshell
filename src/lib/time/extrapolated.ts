// The live half of extrapolation: a state that advances on its own between
// reports. See extrapolate.ts for the arithmetic.
//
// Shaped like `createState` on purpose - `[value, update]` - so a caller swaps
// one for the other and nothing else changes. The difference is that the value
// keeps moving without anyone calling `update`.
import { settable, type State } from '@lib/reactive';
import { createState, onCleanup } from 'ags';
import { interval, type Timer } from 'ags/time';
import GLib from 'gi://GLib';

import { applyReading, extrapolate, type Extrapolation } from './extrapolate';

/** Wall clock in ms: what GLib timers run on. */
const now = () => GLib.get_monotonic_time() / 1000;

export interface ExtrapolatedOptions {
  /** How often the value is recomputed, ms. */
  refreshMs?: number;
  /**
   * Units per second. Omit it to infer the speed from consecutive reports.
   */
  rate?: number;
}

/** Default recompute interval, ms. */
export const DEFAULT_REFRESH_MS = 100;

/**
 * A value that advances between the reports that arrive for it.
 *
 * `update` takes the next report: a plain number. Each report also resets
 * how far the value may run past it - one observed reporting interval - so an
 * estimate that stops receiving reports comes to rest instead of drifting.
 *
 * The timer is armed by the first report and cancelled once the value has
 * come to rest, so an idle estimate costs nothing.
 */
export function createExtrapolated(
  initial: number,
  options: ExtrapolatedOptions = {},
): [State<number>, (next: number) => void] {
  const { refreshMs = DEFAULT_REFRESH_MS, rate } = options;

  const [current, setValue] = createState<number>(initial);
  // `createState` gives an Accessor plus a setter; `State` is the project's
  // single object carrying both, so a caller reads it like any other.
  const value: State<number> = settable<number>(current, setValue);

  let reading: Extrapolation | null = null;
  let timer: Timer | null = null;

  const stop = () => {
    timer?.cancel();
    timer = null;
  };

  /** Bring the drawn value up to date and arm the timer while there is travel. */
  const refresh = () => {
    if (!reading) {
      return;
    }

    const at = now();
    const resting = at >= reading.at + reading.horizon;

    setValue(extrapolate(reading, at));

    if (resting) {
      stop();

      return;
    }

    timer ??= interval(refreshMs, refresh);
  };

  const update = (next: number) => {
    reading = applyReading(reading, { value: next, rate }, now());
    refresh();
  };

  update(initial);

  onCleanup(stop);

  return [value, update];
}
