// The M3 focus ring's geometry and timing, as pure numbers.
//
// No GTK here, so a node test can drive the animation frame by frame - the
// same split as m3Layout/m3Painter and waveStage/trackPainter. The drawing
// lives in focusRingPainter.ts.
//
// Both sliders replace vfunc_snapshot wholesale, so GTK never paints their
// internal CSS nodes: a `:focus-visible slider { outline }` rule is computed
// and then dropped, because nothing draws that node. The ring has to be drawn
// by the widget, which is why it is not in the stylesheet.
//
// Geometry from md-comp-focus-ring (3 px, 8 px active) and from the expressive
// slider in material-web, which wraps the handle instead of drawing a 48 px
// circle around it: the ring hugs the pill, 6 px clear on the sides and 2 px
// above and below.
import { cubicBezier, DURATION } from '@lib/motion';

/** md-comp-focus-ring: width and active-width. */
export const RING_WIDTH = 3;
export const RING_ACTIVE_WIDTH = 8;
/** Clearance between the handle and the ring, px. */
export const RING_GAP_X = 6;
export const RING_GAP_Y = 2;
/** The ring's own corner radius, from the expressive slider. */
export const RING_RADIUS = 2;

/**
 * The CSS animation in styles/_base.scss as numbers: grow to the active width
 * over a quarter of the duration, then settle back over the rest.
 */
const GROW = DURATION.short3;
const SETTLE = DURATION.long1;
const EASE = cubicBezier(0.2, 0, 0, 1);

/** Ring thickness at `elapsed` ms after focus arrived. */
export function ringWidthAt(elapsed: number): number {
  if (elapsed < GROW) {
    return RING_ACTIVE_WIDTH * EASE(elapsed / GROW);
  }

  const settle = Math.min(1, (elapsed - GROW) / SETTLE);

  return RING_ACTIVE_WIDTH + (RING_WIDTH - RING_ACTIVE_WIDTH) * EASE(settle);
}

/**
 * The ring's animation state: whether it is shown, and how far into the
 * grow-and-settle it is.
 *
 * Losing focus is not animated - the ring simply goes away, as the CSS does
 * when `visible` is dropped.
 */
export class FocusRing {
  #visible = false;
  /** ms since focus arrived. */
  #elapsed = 0;
  /** Previous frame time, µs; `null` until the first tick of a run. */
  #last: number | null = null;

  get visible() {
    return this.#visible;
  }

  /** Thickness to draw now; 0 when the ring is not shown. */
  get width() {
    return this.#visible ? ringWidthAt(this.#elapsed) : 0;
  }

  /** Whether the animation has finished and needs no more frames. */
  get atRest() {
    return !this.#visible || this.#elapsed >= GROW + SETTLE;
  }

  /** Show or hide the ring; showing restarts the animation from zero. */
  setVisible(visible: boolean) {
    if (visible === this.#visible) {
      return;
    }

    this.#visible = visible;
    this.#elapsed = 0;
    this.#last = null;
  }

  /** Advance to `now` (µs, Gdk.FrameClock). */
  tick(now: number) {
    if (this.#last !== null) {
      this.#elapsed += (now - this.#last) / 1000;
    }

    this.#last = now;
  }
}
