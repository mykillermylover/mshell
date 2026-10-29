import { Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';

// POSIX signal numbers: GLibUnix does not export them.
const SIGTERM = 15;
const SIGINT = 2;

let hooked = false;

/**
 * Run `flush` before the process exits, whatever the path.
 *
 * AGS 3 quit() immediately calls exit(): Gtk.Application::shutdown is not emitted,
 * and the DBus handler `ags quit` holds its own app.quit binding from the App
 * constructor - it cannot be replaced. The common path of any quit(), including the
 * DBus copy, is the Gtk.Application prototype. Plus session signals: Hyprland
 * logout, kill, Ctrl+C.
 *
 * Only flushes: config and state are the only things with unsaved state.
 */
export function hookExit(flush: () => void): void {
  if (hooked) {
    return;
  }

  const quit = Gtk.Application.prototype.quit;
  Gtk.Application.prototype.quit = function (this: Gtk.Application) {
    try {
      flush();
    } finally {
      quit.call(this);
    }
  };

  app.connect('shutdown', flush);

  const stop = () => {
    app.quit(); // the hook above flushes
    return GLib.SOURCE_REMOVE;
  };
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, SIGTERM, stop);
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, SIGINT, stop);

  hooked = true;
}
