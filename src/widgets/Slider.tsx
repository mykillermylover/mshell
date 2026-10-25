/** Всё, что принимает обычный <slider>. */
export type SliderProps = JSX.IntrinsicElements['slider'];

/**
 * Значение к сетке `min + k * step`. GTK шаг сам не держит: `step_increment`
 * работает только на стрелках, drag и колесо идут через `change-value` с
 * сырым значением - квантовать приходится здесь.
 */
export function snapStep(value: number, min: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  // 0.1 * 3 = 0.30000000000000004: хвост float гасим, шаг не трогаем.
  return Number(snapped.toFixed(10));
}

/** Проп приходит числом или Accessor'ом (тогда gnim подписывается сам). */
const number = (value: SliderProps['step'], fallback: number): number =>
  typeof value === 'number' ? value : (value?.peek() ?? fallback);

/**
 * Slider, значение которого всегда лежит на сетке `min + k * step` -
 * и при перетаскивании, и при колесе, и при стрелках.
 */
export default function Slider({
  step,
  min,
  page,
  onChangeValue,
  ...props
}: SliderProps) {
  // Дефолт Astal
  const stepValue = number(step, 0.05);
  const minValue = number(min, 0);

  return (
    <slider
      {...props}
      step={step}
      min={min}
      // Колесо в GTK берёт page_increment (по умолчанию 0.01), а не step:
      // при page < step тик колеса округляется к текущему значению и
      // слайдер залипает. Пусть колесо идёт ровно на шаг.
      page={page ?? stepValue}
      onChangeValue={(self, scroll, value) => {
        const next = snapStep(value, minValue, stepValue);

        self.set_value(next);
        onChangeValue?.(self, scroll, next);

        // true отменяет default GTK: иначе сырое значение перетрёт наше.
        return true;
      }}
    />
  );
}
