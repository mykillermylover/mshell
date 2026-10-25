/** Everything a regular <slider> accepts. */
export type SliderProps = JSX.IntrinsicElements['slider'];

/**
 * Snap the value to the `min + k * step` grid. GTK does not hold a step on its own: `step_increment`
 * works only for the arrows, drag and wheel go through `change-value` with
 * a raw value - quantization has to happen here.
 */
export function snapStep(value: number, min: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  // 0.1 * 3 = 0.30000000000000004: damp the float tail, leave the step alone.
  return Number(snapped.toFixed(10));
}

/** The prop comes as a number or an Accessor (then gnim subscribes itself). */
const number = (value: SliderProps['step'], fallback: number): number =>
  typeof value === 'number' ? value : (value?.peek() ?? fallback);

/**
 * Slider whose value always lies on the `min + k * step` grid -
 * with dragging, wheel and arrows alike.
 */
export default function Slider({
  step,
  min,
  page,
  onChangeValue,
  ...props
}: SliderProps) {
  // Astal default
  const stepValue = number(step, 0.05);
  const minValue = number(min, 0);

  return (
    <slider
      {...props}
      step={step}
      min={min}
      // The wheel in GTK uses page_increment (0.01 by default), not step:
      // when page < step the wheel tick is rounded to the current value and
      // the slider sticks. Let the wheel move exactly one step.
      page={page ?? stepValue}
      onChangeValue={(self, scroll, value) => {
        const next = snapStep(value, minValue, stepValue);

        self.set_value(next);
        onChangeValue?.(self, scroll, next);

        // true cancels the GTK default: otherwise the raw value would overwrite ours.
        return true;
      }}
    />
  );
}
