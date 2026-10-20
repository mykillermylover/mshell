import { Gtk } from 'ags/gtk4';

/** Контент окна — то, что возвращает JSX-компонент. */
export type Content = () => JSX.Element;

/** Обёртка контента окна: задаёт отступы и прозрачный фон (фон рисует LiquidField). */
export const padded = (child: JSX.Element) => {
  const body = new Gtk.Box();
  body.add_css_class('frame-body');
  // gnim типизирует результат JSX как GObject.Object; на деле это Gtk.Widget.
  body.append(child as Gtk.Widget);
  return body;
};
