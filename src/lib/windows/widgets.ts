// JSX to widget: what the JSX component returns is a Gtk.Widget in disguise.
import type { Rect } from '@lib/geometry';
import { Gtk } from 'ags/gtk4';

/** gnim types the JSX result as GObject.Object; in fact it is Gtk.Widget. */
export function asWidget(child: JSX.Element): Gtk.Widget {
  return child as Gtk.Widget;
}

/** Window content wrapper: an unscoped box for the content root (no styles). */
export function wrapped(child: JSX.Element): Gtk.Box {
  const body = new Gtk.Box();
  body.append(asWidget(child));
  return body;
}
/** Window body bounds; null if it is not laid out yet. */
export function boundsOf(
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null {
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
}
