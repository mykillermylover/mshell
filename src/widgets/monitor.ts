import type { Accessor } from 'ags';
import { createState } from 'ags';
import type { Gdk, Gtk } from 'ags/gtk4';

function monitorOf(widget: Gtk.Widget): Gdk.Monitor | null {
  const surface = widget.get_native()?.get_surface();

  if (!surface) {
    return null;
  }

  return surface.get_display().get_monitor_at_surface(surface) ?? null;
}

export function useMonitor(): [
  Accessor<Gdk.Monitor | null>,
  (self: Gtk.Widget) => void,
] {
  const [monitor, setMonitor] = createState<Gdk.Monitor | null>(null);

  return [monitor, (self) => setMonitor(monitorOf(self))];
}
