import { config } from '@lib/config/app';
import { glibScheduler } from '@lib/glibScheduler';
import { Debounce } from '@lib/schedule';
import { Gdk, Gtk } from 'ags/gtk4';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { requestPalette } from './generate';
import { PALETTE_DIR, PALETTE_FILE } from './paths';
import {
  isPaletteCss,
  normalizeThemePreference,
  normalizeThemeScheme,
  ThemePreference,
} from './policy';

const RELOAD_DELAY_MS = 150;

// The FileMonitor must live as long as the application.
const monitors: Gio.FileMonitor[] = [];

// wallpaper|scheme|contrast of the last started generation.
let lastPaletteSignature = '';

/** System scheme or forced one — for the whole AGS process. */
function applyThemeMode(value: string) {
  const mode = normalizeThemePreference(value);
  const sm = Adw.StyleManager.get_default();

  if (mode === ThemePreference.LIGHT) {
    sm.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
  } else if (mode === ThemePreference.DARK) {
    sm.color_scheme = Adw.ColorScheme.FORCE_DARK;
  } else {
    sm.color_scheme = Adw.ColorScheme.DEFAULT;
  }
}

/**
 * CSS is applied by its own provider, not through app.start: only this way
 * can prefers-color-scheme be set, without which @media in GTK
 * always picks the light branch.
 */
/** Run matugen if wallpaper, scheme or contrast changed. */
function syncPalette(force = false) {
  const wallpaper = config.theme.wallpaper();
  if (!wallpaper) {
    return;
  }

  const scheme = normalizeThemeScheme(config.theme.scheme());
  const contrast = config.theme.contrast();
  const preferredColors = config.theme.preferredColors();
  const signature = `${wallpaper}|${scheme}|${contrast}|${preferredColors}`;

  if (!force && signature === lastPaletteSignature) {
    return;
  }

  lastPaletteSignature = signature;
  requestPalette({ wallpaper, scheme, contrast, preferredColors });
}

/** Single entry point: mode and palette are always applied together. */
export function applyTheme(force = false) {
  applyThemeMode(config.theme.mode());
  syncPalette(force);
}

export function initTheme(css: string) {
  applyTheme(true);

  // There is one Display per Wayland session; monitors are Gdk.Monitor inside it.
  // A provider on the display affects all windows of all monitors.
  const display = Gdk.Display.get_default();
  if (!display) {
    throw new Error('no display');
  }

  const sm = Adw.StyleManager.get_default();
  const provider = new Gtk.CssProvider();
  let palette = '';

  provider.connect('parsing-error', (_p, section, error) => {
    const loc = section.get_start_location();
    console.error(
      `CSS Error ${section.get_file()?.get_basename() ?? ''}:` +
        `${loc.lines + 1}:${loc.line_chars + 1} ${error.message}`,
    );
  });

  const sync = () => {
    provider.prefers_color_scheme = sm.dark
      ? Gtk.InterfaceColorScheme.DARK
      : Gtk.InterfaceColorScheme.LIGHT;
  };

  /**
   * A missing file means fallback, while a corrupted one is a reason to keep
   * the last working palette.
   */
  const read = () => {
    if (!GLib.file_test(PALETTE_FILE, GLib.FileTest.EXISTS)) {
      palette = '';
      return;
    }

    try {
      const [ok, bytes] = GLib.file_get_contents(PALETTE_FILE);
      if (!ok) {
        return;
      }

      const generated = new TextDecoder().decode(bytes);
      if (isPaletteCss(generated)) {
        palette = generated;
      }
    } catch (error) {
      console.warn(`theme: cannot read ${PALETTE_FILE}: ${String(error)}`);
    }
  };

  const reload = () => {
    read();
    provider.load_from_string(css + palette);
  };

  GLib.mkdir_with_parents(PALETTE_DIR, 0o755);

  sync();
  reload();
  Gtk.StyleContext.add_provider_for_display(
    display,
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_USER,
  );

  sm.connect('notify::dark', sync);

  const reloadDebounce = new Debounce(RELOAD_DELAY_MS, glibScheduler);

  const monitor = Gio.File.new_for_path(PALETTE_DIR).monitor_directory(
    Gio.FileMonitorFlags.NONE,
    null,
  );

  monitor.connect('changed', (_monitor, file) => {
    if (file?.get_basename() === 'palette.css') {
      reloadDebounce.schedule(reload);
    }
  });

  monitors.push(monitor);
}
