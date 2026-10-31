// One invisible layer surface per (monitor, edge). Its only job is to make the
// compositor keep a strip of that edge clear; drawing stays in Frame.
import type { Edge } from '@lib/windows/popLayout';
import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import giCairo from 'cairo';
import Gtk4LayerShell from 'gi://Gtk4LayerShell?version=1.0';

/** Pinned to one edge and stretched along the other axis. */
const anchorOf = (edge: Edge): Astal.WindowAnchor => {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor;

  switch (edge) {
    case 'top': {
      return TOP | LEFT | RIGHT;
    }
    case 'bottom': {
      return BOTTOM | LEFT | RIGHT;
    }
    case 'left': {
      return LEFT | TOP | BOTTOM;
    }
    default: {
      return RIGHT | TOP | BOTTOM;
    }
  }
};

/**
 * Spacer surface: the exclusive zone is set explicitly from the thickness, so
 * nothing is drawn and no input is accepted.
 */
export class Reserve {
  readonly #surface: Astal.Window;
  readonly #strip: Gtk.Box;
  readonly #horizontal: boolean;
  #thickness: number;

  constructor(monitor: Gdk.Monitor, edge: Edge, thickness: number) {
    this.#horizontal = edge === 'top' || edge === 'bottom';
    this.#thickness = thickness;

    this.#surface = new Astal.Window({
      application: app,
      namespace: 'frame-reserve',
      gdkmonitor: monitor,
      anchor: anchorOf(edge),
      // The zone is set explicitly below: EXCLUSIVE (auto) reads GTK's window
      // geometry, which a drawless surface never reports.
      exclusivity: Astal.Exclusivity.NORMAL,
      layer: Astal.Layer.TOP,
      keymode: Astal.Keymode.NONE,
      cssClasses: ['frame-reserve'],
    });

    // The strip carries the size request: the window's natural size follows it.
    this.#strip = new Gtk.Box({
      hexpand: true,
      vexpand: true,
    });
    this.#applyThickness();
    this.#surface.set_child(this.#strip);

    // Must not swallow pointer events meant for the frame below.
    this.#surface.connect('map', () => this.#clearInput());

    this.#surface.present();
  }

  // A zero band never reaches this method: Frame destroys the surface for an edge with no sources.
  /** No-op when the value does not change: every change reflows the tiling. */
  setThickness(value: number) {
    if (value === this.#thickness) {
      return;
    }
    this.#thickness = value;
    this.#applyThickness();
  }

  destroy() {
    this.#surface.destroy();
  }

  #applyThickness() {
    this.#strip.set_size_request(
      this.#horizontal ? -1 : this.#thickness,
      this.#horizontal ? this.#thickness : -1,
    );
    // Explicit zone: the auto zone depends on GTK's window geometry, which a
    // drawless surface never reports. The explicit setter also commits.
    Gtk4LayerShell.set_exclusive_zone(this.#surface, this.#thickness);
  }

  #clearInput() {
    const surface = this.#surface.get_surface();
    if (!surface) {
      return;
    }
    // An empty region: clicks fall through to the frame.
    try {
      surface.set_input_region(new giCairo.Region());
    } catch (error) {
      console.error('[reserve] set_input_region:', error);
    }
  }
}
