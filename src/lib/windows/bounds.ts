// Geometry helper for window widgets: no contract, no widgets built.
import type { Rect } from '@lib/geometry';
import type { Gtk } from 'ags/gtk4';

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
