import { Gtk } from 'ags/gtk4';

import type { Rect } from './GooField';
import { padded } from './ui';

/** Плавающее окно: таскается за заголовок, у рамки примагничивается и сливается с ней. */
export interface FloatSpec {
  id: string;
  title?: string;
  x: number;
  y: number;
  content: () => Gtk.Widget;
  open?: boolean;
}

/** Плавающее окно: шапка-«ручка» с крестиком и тело с контентом. */
export class Float {
  readonly revealer: Gtk.Revealer;
  readonly grip: Gtk.Box;
  readonly closeBtn: Gtk.Widget;
  x: number;
  y: number;

  constructor(
    readonly spec: FloatSpec,
    onClose: () => void,
    revealed: () => void,
    private duration: () => number,
  ) {
    const grip = new Gtk.Box({ spacing: 8 });
    grip.add_css_class('float-grip');
    grip.append(
      new Gtk.Label({ label: spec.title ?? spec.id, hexpand: true, xalign: 0 }),
    );
    const closeBtn = Gtk.Button.new_from_icon_name('window-close-symbolic');
    closeBtn.add_css_class('flat');
    closeBtn.connect('clicked', onClose);
    grip.append(closeBtn);

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    box.add_css_class('float');
    box.append(grip);
    box.append(padded(spec.content()));

    const revealer = new Gtk.Revealer({
      transitionType: Gtk.RevealerTransitionType.SLIDE_DOWN,
      transitionDuration: duration(),
      revealChild: spec.open ?? true,
    });
    revealer.set_child(box);
    revealer.connect('notify::child-revealed', revealed);

    this.revealer = revealer;
    this.grip = grip;
    this.closeBtn = closeBtn;
    this.x = spec.x;
    this.y = spec.y;
  }

  /** Обновить длительность по текущему конфигу. */
  apply() {
    this.revealer.transitionDuration = this.duration();
  }

  /** Текущая граница на экране — по ней поле слизи и примагничивание. */
  get rect(): Rect {
    return {
      x: this.x,
      y: this.y,
      w: this.revealer.get_width(),
      h: this.revealer.get_height(),
    };
  }

  /** Размер, который окно хочет само (не зависит от текущей раскладки). */
  natural(): [number, number] {
    const child = this.revealer.get_child();
    if (!child) {
      return [0, 0];
    }
    const [, natural] = child.get_preferred_size();
    if (!natural) {
      return [0, 0];
    }
    return [natural.width, natural.height];
  }
}
