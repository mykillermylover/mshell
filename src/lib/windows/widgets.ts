// JSX to widget: what the JSX component returns is a Gtk.Widget in disguise.
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
