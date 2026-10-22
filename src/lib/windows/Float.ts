import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { boundsOf, type Content } from './ui';
import { Window } from './window';

/** Плавающее окно: таскается за заголовок, у рамки примагничивается и сливается с ней. */
export interface FloatSpec {
  id: string;
  title?: string;
  x: number;
  y: number;
  content: Content;
  open?: boolean;
}

/** Плавающее окно: шапка-«ручка» с крестиком и тело с контентом. */
export class Float extends Window {
  readonly grip: Gtk.Box;
  readonly closeBtn: Gtk.Widget;
  x: number;
  y: number;

  constructor(
    readonly spec: FloatSpec,
    private duration: () => number,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: Gtk.RevealerTransitionType.SLIDE_DOWN,
      transitionDuration: duration(),
      revealChild: spec.open ?? true,
    });
    super({ id: spec.id, content: spec.content, revealer });

    const grip = new Gtk.Box({ spacing: 8 });
    grip.add_css_class('float-grip');
    grip.append(
      new Gtk.Label({ label: spec.title ?? spec.id, hexpand: true, xalign: 0 }),
    );
    const closeBtn = Gtk.Button.new_from_icon_name('window-close-symbolic');
    closeBtn.add_css_class('flat');
    closeBtn.connect('clicked', () => this.close());
    grip.append(closeBtn);

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    box.add_css_class('float');
    box.append(grip);
    box.append(this.contentWidget);
    revealer.set_child(box);

    this.grip = grip;
    this.closeBtn = closeBtn;
    this.x = spec.x;
    this.y = spec.y;
  }

  bounds(relativeTo: Gtk.Widget): Rect | null {
    const rect = boundsOf(this.revealer, relativeTo);
    if (!rect) {
      return null;
    }
    // x/y — логическая позиция в Fixed: move() применяет её сразу, а
    // compute_bounds отдаёт аллокацию прошлого кадра. Магнит на drag-end
    // должен видеть позицию, которую только что поставили.
    return { ...rect, x: this.x, y: this.y };
  }

  inputBounds(relativeTo: Gtk.Widget): Rect | null {
    return this.bounds(relativeTo);
  }

  /** Обновить длительность по текущему конфигу. */
  apply() {
    this.revealer.transitionDuration = this.duration();
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
