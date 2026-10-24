import { config } from '@lib/config/app';
import { Gdk, Gtk } from 'ags/gtk4';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { requestPalette } from './generate';
import {
  isPaletteCss,
  normalizeThemePreference,
  normalizeThemeScheme,
  ThemePreference,
} from './policy';

const PALETTE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'mshell']);
const PALETTE_FILE = GLib.build_filenamev([PALETTE_DIR, 'palette.css']);
const RELOAD_DELAY_MS = 150;

// FileMonitor должен жить, пока живёт приложение.
const monitors: Gio.FileMonitor[] = [];

// wallpaper|scheme|contrast последней запущенной генерации.
let lastPaletteSignature = '';

/** Системная схема или принудительная — для всего процесса AGS. */
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
 * CSS применяется своим провайдером, а не через app.start: только так
 * можно выставить prefers-color-scheme, без которого @media в GTK
 * всегда выбирает светлую ветку.
 */
/** Запустить matugen, если изменились wallpaper, scheme или contrast. */
function syncPalette(force = false) {
  const wallpaper = config.theme.wallpaper();
  if (!wallpaper) {
    return;
  }

  const scheme = normalizeThemeScheme(config.theme.scheme());
  const contrast = config.theme.contrast();
  const signature = `${wallpaper}|${scheme}|${contrast}`;

  if (!force && signature === lastPaletteSignature) {
    return;
  }

  lastPaletteSignature = signature;
  requestPalette({ wallpaper, scheme, contrast });
}

/** Единая точка: режим и палитра всегда применяются вместе. */
export function applyTheme(force = false) {
  applyThemeMode(config.theme.mode());
  syncPalette(force);
}

export function initTheme(css: string) {
  applyTheme(true);

  // Display один на Wayland-сессию; мониторы - это Gdk.Monitor внутри него.
  // Провайдер на display действует на все окна всех мониторов.
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
   * Пропавший файл означает fallback, а битый - повод оставить
   * последнюю рабочую палитру.
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

  let reloadId: number | null = null;

  const schedule = () => {
    if (reloadId !== null) {
      GLib.source_remove(reloadId);
    }

    reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DELAY_MS, () => {
      reloadId = null;
      reload();
      return GLib.SOURCE_REMOVE;
    });
  };

  const monitor = Gio.File.new_for_path(PALETTE_DIR).monitor_directory(
    Gio.FileMonitorFlags.NONE,
    null,
  );

  monitor.connect('changed', (_monitor, file) => {
    if (file?.get_basename() === 'palette.css') {
      schedule();
    }
  });

  monitors.push(monitor);
}
