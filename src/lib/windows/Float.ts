import type { FieldStyle } from '@lib/config';
import { Gtk } from 'ags/gtk4';

import { boundsOf, type FloatSpec, type WindowHost } from './api';
import { Window, type WindowMeasure } from './window';

/** Floating window: a "handle" header with a close button and a body with content. */
export class Float extends Window {
  readonly grip: Gtk.Box;
  readonly closeBtn: Gtk.Widget;
  x: number;
  y: number;

  constructor(
    readonly spec: FloatSpec,
    private style: () => FieldStyle,
    host: WindowHost,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: Gtk.RevealerTransitionType.SLIDE_DOWN,
      transitionDuration: style().revealDuration,
      revealChild: true,
    });
    super({
      id: spec.id,
      content: spec.content,
      revealer,
      host,
      keyboard: spec.keyboard,
    });

    const grip = new Gtk.Box({ spacing: 8 });
    grip.add_css_class('float-grip');
    grip.append(
      new Gtk.Label({ label: spec.title ?? spec.id, hexpand: true, xalign: 0 }),
    );
    const closeBtn = Gtk.Button.new_from_icon_name('window-close-symbolic');
    closeBtn.add_css_class('flat');
    closeBtn.add_css_class('grip-button');
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

  measure(relativeTo: Gtk.Widget): WindowMeasure {
    const rect = boundsOf(this.revealer, relativeTo);
    if (!rect) {
      return { body: null, input: null };
    }
    // x/y - logical position in Fixed: move() applies it immediately, while
    // compute_bounds returns the previous frame's allocation. The magnet at drag-end
    // must see the position just set.
    const body = { ...rect, x: this.x, y: this.y };
    return { body, input: body };
  }

  /** Update the duration from the current config. */
  apply() {
    this.revealer.transitionDuration = this.style().revealDuration;
  }

  /** The size the window wants itself (independent of the current layout). */
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
