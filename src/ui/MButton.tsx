import type { MaybeAccessor } from '@lib/reactive';
import { asAccessor } from '@lib/reactive';
import { createComputed } from 'ags';
import { Gtk } from 'ags/gtk4';

type MButtonShape = 'squared' | 'round';
type MButtonColor = 'elevated' | 'filled' | 'tonal' | 'outlined' | 'text';

type MButtonProps = JSX.IntrinsicElements['button'] & {
  shape?: MaybeAccessor<MButtonShape>;
  color?: MaybeAccessor<MButtonColor>;
};

const DEFAULT_BUTTON_CLASS = 'mbutton';

/**
 * Feeds the press point to the ripple.
 *
 * The animation itself lives in CSS and hangs off `:active`; the widget only
 * has to say where the press landed. Writing the point and GTK setting
 * `:active` both happen on the same press, and the provider takes effect
 * before the animation's first frame, so the circle starts where it should.
 *
 * The coordinates come from the click gesture GtkButton already owns - adding
 * a second one could take the press over and leave `clicked` unfired.
 */
const attachRipple = (self: Gtk.Widget) => {
  let provider: Gtk.CssProvider | null = null;

  /**
   * Writes the press point into `--_rx`/`--_ry`.
   *
   * The gesture measures from the content box - inside the padding - while the
   * background gradient measures from the border box. The padding is what
   * separates the two, so it has to be added back or the circle lands one
   * padding-width to the left of the pointer.
   */
  const setPoint = (x: number, y: number) => {
    const style = self.get_style_context();
    const padding = style.get_padding();

    if (provider) {
      style.remove_provider(provider);
    }

    provider = new Gtk.CssProvider();
    provider.load_from_string(
      `* { --_rx: ${x + padding.left}px; --_ry: ${y + padding.top}px; }`,
    );
    style.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
  };

  const controllers = self.observe_controllers();

  for (let i = 0; i < controllers.get_n_items(); i++) {
    const controller = controllers.get_item(i);

    if (!(controller instanceof Gtk.GestureClick)) {
      continue;
    }

    controller.connect('pressed', (_gesture, _nPress, x, y) => setPoint(x, y));

    return;
  }
};

export default function MButton(props: MButtonProps) {
  const { shape = 'round', color = 'filled', cssClasses, ...rest } = props;

  const cssClassesAccessor = asAccessor(cssClasses ?? []);
  const shapeAccessor = asAccessor(shape);
  const colorAccessor = asAccessor(color);

  const classes = createComputed(() => {
    const classesSet = new Set(cssClassesAccessor());
    classesSet.add(DEFAULT_BUTTON_CLASS);
    classesSet.add(shapeAccessor());
    classesSet.add(colorAccessor());

    return [...classesSet];
  });

  return <button {...rest} cssClasses={classes} $={attachRipple} />;
}
