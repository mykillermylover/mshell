/**
 * Overshoot of the snap tween. The canonical easeOutBack (Adwaita's
 * EASE_OUT_BACK, CSS `cubic-bezier` equivalents) uses 1.70158 here; the magnet
 * deliberately overshoots further - about 13 % over the target at the peak
 * against the canonical 10 % - so the window visibly drives past the edge
 * before it settles. Change this number, not the formula, to tune it.
 */
const OVERSHOOT = 2;

/**
 * easeOutBack: 1 at both ends, over 1 in the middle by design.
 * The standard family: c3 = c1 + 1, so `1 + c3·p³ + c1·p²` with p = t - 1.
 */
export function easeOutBack(t: number): number {
  const p = t - 1;

  return 1 + (OVERSHOOT + 1) * p ** 3 + OVERSHOOT * p ** 2;
}

/**
 * GtkProgressTracker's easing (`gtk_progress_tracker_get_ease_out_cubic`).
 * Front-loaded, so motion reads as immediate.
 *
 * Only the slider's tween uses it now: the revealer and the size container
 * animate on Material 3 curves from `@lib/motion`. It is still the curve GTK
 * animates with, so it comes back if a revealer is ever put into CROSSFADE -
 * that is the one mode where Gtk.Revealer animates itself.
 */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
