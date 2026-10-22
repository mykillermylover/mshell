import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';

/** Контент окна — то, что возвращает JSX-компонент. */
export type Content = () => JSX.Element;

/** Обёртка контента окна: отступы и прозрачный фон (фон рисует LiquidField). */
export const padded = (child: JSX.Element) => {
  const body = new Gtk.Box();
  body.add_css_class('frame-body');
  // gnim типизирует результат JSX как GObject.Object; на деле это Gtk.Widget.
  body.append(child as Gtk.Widget);
  return body;
};

/** Границы тела окна; null, если оно ещё не разложено. */
export const boundsOf = (
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null => {
  const [ok, bounds] = widget.compute_bounds(relativeTo);
  if (!ok || bounds.get_width() < 1 || bounds.get_height() < 1) {
    return null;
  }
  return {
    x: bounds.get_x(),
    y: bounds.get_y(),
    w: bounds.get_width(),
    h: bounds.get_height(),
  };
};
