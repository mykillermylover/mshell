import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { boundsOf, type WindowBody } from './body';
import { type Content, padded } from './ui';

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
export class Float implements WindowBody {
  readonly revealer: Gtk.Revealer;
  readonly grip: Gtk.Box;
  readonly closeBtn: Gtk.Widget;
  x: number;
  y: number;

  constructor(
    readonly spec: FloatSpec,
    onClose: () => void,
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

    this.revealer = revealer;
    this.grip = grip;
    this.closeBtn = closeBtn;
    this.x = spec.x;
    this.y = spec.y;
  }

  get open(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    return this.revealer.reveal_child !== this.revealer.child_revealed;
  }

  setOpen(open: boolean) {
    this.revealer.reveal_child = open;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  subscribe(fn: () => void): () => void {
    const ids = [
      this.revealer.connect('notify::reveal-child', fn),
      this.revealer.connect('notify::child-revealed', fn),
    ];
    return () => {
      for (const id of ids) {
        this.revealer.disconnect(id);
      }
    };
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
