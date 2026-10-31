import type { MaybeAccessor } from '@lib/reactive';
import { asAccessor } from '@lib/reactive';
import type { Variant } from '@ui/variant';
import { createComputed } from 'ags';

type MButtonShape = 'squared' | 'round';
type MButtonColor = 'elevated' | 'filled' | 'tonal' | 'outlined' | 'text';

type MButtonProps = JSX.IntrinsicElements['button'] & {
  shape?: MaybeAccessor<MButtonShape>;
  color?: MaybeAccessor<MButtonColor>;
  variant?: MaybeAccessor<Variant>;
};

const DEFAULT_BUTTON_CLASS = 'mbutton';

export default function MButton(props: MButtonProps) {
  const {
    shape = 'round',
    color = 'filled',
    variant = 'primary',
    cssClasses,
    ...rest
  } = props;

  const cssClassesAccessor = asAccessor(cssClasses ?? []);
  const shapeAccessor = asAccessor(shape);
  const colorAccessor = asAccessor(color);
  const variantAccessor = asAccessor(variant);

  const classes = createComputed(() => {
    const classesSet = new Set(cssClassesAccessor());
    classesSet.add(DEFAULT_BUTTON_CLASS);
    classesSet.add(shapeAccessor());
    classesSet.add(colorAccessor());
    classesSet.add(variantAccessor());

    return [...classesSet];
  });

  return <button {...rest} cssClasses={classes} />;
}
