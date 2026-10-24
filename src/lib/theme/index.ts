import { Gdk, Gtk } from 'ags/gtk4';
import Adw from 'gi://Adw';

/**
 * CSS применяется своим провайдером, а не через app.start: только так
 * можно выставить prefers-color-scheme, без которого @media в GTK
 * всегда выбирает светлую ветку.
 */
export function initTheme(css: string) {
  // Display один на Wayland-сессию; мониторы - это Gdk.Monitor внутри него.
  // Провайдер на display действует на все окна всех мониторов.
  const display = Gdk.Display.get_default();
  if (!display) {
    throw new Error('no display');
  }

  const sm = Adw.StyleManager.get_default();
  const provider = new Gtk.CssProvider();

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

  sync();
  provider.load_from_string(css);
  Gtk.StyleContext.add_provider_for_display(
    display,
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_USER,
  );

  sm.connect('notify::dark', sync);
}
