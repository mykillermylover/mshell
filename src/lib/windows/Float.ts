import type { FieldStyle } from '@lib/config';
import { Gtk } from 'ags/gtk4';

import {
  asWidget,
  boundsOf,
  createWindowContent,
  type FloatSpec,
  type WindowHost,
} from './api';
import { Window, type WindowMeasure } from './window';

/** Floating window: a "handle" header (any widget) above the body with content. */
export class Float extends Window {
  readonly grip: Gtk.Box;
  x: number;
  y: number;
  private readonly disposeHeader: () => void;

  constructor(
    readonly spec: FloatSpec,
    private style: () => FieldStyle,
    host: WindowHost,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: Gtk.RevealerTransitionType.FADE_SLIDE_UP,
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

    const grip = new Gtk.Box();
    const header = createWindowContent(this.api, () => asWidget(spec.header()));
    grip.append(header.content);

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    box.append(grip);
    box.append(this.contentWidget);
    revealer.set_child(box);

    this.grip = grip;
    this.disposeHeader = header.dispose;
    this.x = spec.x;
    this.y = spec.y;
  }

  override dispose() {
    this.disposeHeader();
    super.dispose();
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
