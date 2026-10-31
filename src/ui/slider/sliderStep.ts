// Shared slider arithmetic: the step grid every slider snaps to, and the
// glue for props that arrive either as plain values or as Accessors.
import { Accessor } from 'ags';

/**
 * Snap the value to the `min + k * step` grid.
 *
 * GTK does not hold a step on its own: `step_increment` drives only the arrow
 * keys, while a click, the wheel and a drag all deliver a raw value -
 * quantization has to happen here.
 */
export function snapStep(value: number, min: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  // 0.1 * 3 = 0.30000000000000004: damp the float tail, leave the step alone.
  return Number(snapped.toFixed(10));
}

/**
 * Map a value onto a span of pixels: where the playhead sits for that value.
 *
 * The caller gives the span, because it differs between the sliders: the M3
 * one stays a pixel inside the trough at each end so its handle never hangs
 * off, while the media one fills the trough completely.
 *
 * A degenerate range (a stream with no length yet) parks the result at the
 * start instead of dividing by zero.
 */
export function handleCenterFor(
  value: number,
  min: number,
  max: number,
  start: number,
  end: number,
): number {
  if (!(max > min)) {
    return start;
  }

  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));

  return start + t * (end - start);
}

/**
 * A numeric prop that may arrive as a plain value or as an Accessor, read
 * once at construction time (gnim subscribes the Accessor itself afterwards).
 */
export const numeric = (
  value: number | Accessor<number> | undefined,
  fallback: number,
): number => {
  if (typeof value === 'number') {
    return value;
  }

  return value instanceof Accessor ? value.peek() : fallback;
};

/**
 * Snap a value onto a live slider's own grid.
 *
 * Read from the widget, not from the props: gnim binds the `min`/`step`
 * Accessors onto the adjustment, so the widget's grid may already differ from
 * whatever the props said at construction time.
 */
export function snapToSlider(
  slider: {
    get_min(): number;
    get_step(): number;
  },
  value: number,
): number {
  return snapStep(value, slider.get_min(), slider.get_step());
}
