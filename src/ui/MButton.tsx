import type { MaybeAccessor } from '@lib/reactive';
import { findController } from '@lib/reactive';
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
 * material-web's MINIMUM_PRESS_MS: a click shorter than this still gets shown
 * its ripple. Mouse clicks last 80-150ms, so without it most of them would
 * flash a quarter-grown circle and fade.
 */
const MIN_PRESS_MS = 225;

/**
 * Feeds the press point to the ripple and keeps the growth on screen for at
 * least `MIN_PRESS_MS`.
 *
 * The animation itself lives in CSS; the widget only has to say where the press
 * landed. Writing the point and GTK setting `:active` both happen on the same
 * press, and the provider takes effect before the animation's first frame, so
 * the circle starts where it should.
 *
 * `:active` alone cannot carry the minimum: GTK drops it the moment the pointer
 * goes up and the animation dies with it. So the press also adds `.ripple`,
 * which is what the animation hangs off, and a short release holds it for
 * whatever is left of the minimum.
 *
 * The coordinates come from the click gesture GtkButton already owns - adding
 * a second one could take the press over and leave `clicked` unfired.
 */
const attachRipple = (self: Gtk.Widget) => {
  let provider: Gtk.CssProvider | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;

  const cancelHide = () => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  /** Drops the class, which removes the animation and lets the gradient fade. */
  const hide = () => {
    cancelHide();
    self.remove_css_class('ripple');
  };

  /**
   * Writes the press point and the starting radius into the custom properties
   * the ripple reads.
   *
   * The gesture measures from the content box - inside the padding - while the
   * background gradient measures from the border box. The padding is what
   * separates the two, so it has to be added back or the circle lands one
   * padding-width to the left of the pointer.
   *
   * The circle does not start as a point: material-web starts it as a disc a
   * fifth of the button's longer side across (INITIAL_ORIGIN_SCALE), which is
   * what makes a press read as a spot under the finger. `circle` sizes its
   * stops against the distance to the far corner, so that diameter is handed
   * over as a fraction of that distance.
   */
  const setPoint = (x: number, y: number) => {
    const style = self.get_style_context();
    const padding = style.get_padding();
    const px = x + padding.left;
    const py = y + padding.top;

    const width = self.get_width();
    const height = self.get_height();

    // Half of a fifth of the longer side - the disc's radius.
    const startRadius = 0.1 * Math.max(width, height);
    const reach = Math.hypot(
      Math.max(px, width - px),
      Math.max(py, height - py),
    );
    const start = reach > 0 ? (startRadius / reach) * 100 : 0;

    if (provider) {
      style.remove_provider(provider);
    }

    provider = new Gtk.CssProvider();
    provider.load_from_string(
      `* { --_rx: ${px}px; --_ry: ${py}px;` +
        ` --_r0: ${(start * 0.65).toFixed(2)}%; --_r1: ${start.toFixed(2)}%; }`,
    );
    style.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
  };

  /** Ends the press, but not before the ripple has had its minimum time. */
  const release = () => {
    const remaining = MIN_PRESS_MS - (Date.now() - shownAt);

    if (remaining <= 0) {
      hide();
      return;
    }

    cancelHide();
    hideTimer = setTimeout(hide, remaining);
  };

  const controller = findController(self, Gtk.GestureClick);

  if (!controller) {
    return;
  }

  controller.connect('pressed', (_gesture, _nPress, x, y) => {
    // A press while the previous ripple is still being held open starts a
    // new one, so the pending hide belongs to the old press and must go.
    cancelHide();
    shownAt = Date.now();
    setPoint(x, y);
    self.add_css_class('ripple');
  });

  controller.connect('released', release);
  // The gesture stops when the press is taken away - dragging off the button,
  // a second pointer - and the ripple has to end the same way.
  controller.connect('stopped', release);
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
