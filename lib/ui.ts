import { Gtk } from 'ags/gtk4';

/** Обёртка контента окна: задаёт отступы и прозрачный фон (фон рисует LiquidField). */
export const padded = (child: Gtk.Widget) => {
  const body = new Gtk.Box();
  body.add_css_class('frame-body');
  body.append(child);
  return body;
};
