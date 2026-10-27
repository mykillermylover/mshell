import { type FieldStyle, type Reactive, snapshot } from '@lib/config';
import { LiquidField } from '@lib/liquid/LiquidField';
import { Float } from '@lib/windows/Float';
import type { WindowHost } from '@lib/windows/host';
import { Pop } from '@lib/windows/Pop';
import type { FloatSpec, PopSpec } from '@lib/windows/spec';
import type { Window } from '@lib/windows/window';
import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import GLib from 'gi://GLib';

import { FrameInput } from './FrameInput';
import { FrameKeyboard, type KeyboardMode } from './FrameKeyboard';
import { FrameMotion } from './FrameMotion';
import { FrameWindows } from './FrameWindows';

/** The arbitration speaks in its own words; Astal names the same three states. */
const KEYMODE: Record<KeyboardMode, Astal.Keymode> = {
  none: Astal.Keymode.NONE,
  'on-demand': Astal.Keymode.ON_DEMAND,
  exclusive: Astal.Keymode.EXCLUSIVE,
};

/**
 * Field host for one monitor:
 *   Overlay
 *    ├─ LiquidField - draws the frame and ALL windows as a single field (shape = what is in the layout)
 *    ├─ Fixed - floating windows (Float)
 *    └─ Pop×N - popover components (Box from the Revealer and hover zones)
 * Windows are transparent and draw only their content; LiquidField draws the background behind them.
 * Every frame the shape comes from Frame.measure() (Window.measure), so
 * animation and shape do not drift apart.
 */
export class Frame {
  private readonly surface: Astal.Window;
  readonly connector: string | null;
  private field = new LiquidField();
  private fixed = new Gtk.Fixed();
  private readonly windows: FrameWindows<Window>;
  private readonly host: WindowHost;
  private readonly overlay: Gtk.Overlay;
  private readonly input: FrameInput;
  private readonly motion: FrameMotion;
  private readonly keyboard: FrameKeyboard;

  /** Narrow access for debug commands; see lib/debug.tsx. */
  readonly debug = {
    float: (id: string) => {
      const body = this.windows.get(id);
      return body instanceof Float ? body : undefined;
    },
    pop: (id: string) => {
      const body = this.windows.get(id);
      return body instanceof Pop ? body : undefined;
    },
    size: () => ({ w: this.field.get_width(), h: this.field.get_height() }),
    border: () => this.style.border(),
    rects: () => this.windows.measure().rects,
    inputs: () => this.windows.measure().inputs,
    region: () => this.input.boxes,
    move: (float: Float, x: number, y: number) => {
      this.motion.move(float, x, y);
    },
    tween: (
      float: Float,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      duration: number,
    ) => {
      this.motion.tween(float, fromX, fromY, toX, toY, duration);
    },
    snap: (float: Float) => this.motion.snap(float),
  };

  /** Processed ticks - for the debug frames command. */
  get tickCount(): number {
    return this.motion.tickCount;
  }

  constructor(
    monitor: Gdk.Monitor,
    pops: PopSpec[],
    floats: FloatSpec[],
    private style: Reactive<FieldStyle>,
  ) {
    this.connector = monitor.get_connector();
    this.host = {
      monitor,
      addFloat: (spec) => this.addFloat(spec),
      remove: (id) => this.remove(id),
      hoverKeyboard: (owner, entering) => this.keyboard.hover(owner, entering),
      exclusiveKeyboard: (owner, active) =>
        this.keyboard.exclusive(owner, active),
      unfocusKeyboard: (owner) => this.keyboard.unfocus(owner),
      isolateFocus: (owner) => this.isolateFocus(owner),
    };
    const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor;

    this.surface = new Astal.Window({
      application: app,
      namespace: 'frame', // for layerrule in Hyprland
      gdkmonitor: monitor,
      anchor: TOP | BOTTOM | LEFT | RIGHT,
      exclusivity: Astal.Exclusivity.IGNORE, // the compositor reserves space for the frame (gaps_out)
      layer: Astal.Layer.TOP,
      // NONE: otherwise Hyprland takes both the keyboard and the pointer on map.
      // We will enable ON_DEMAND selectively when windows with input fields appear.
      keymode: Astal.Keymode.NONE,
      cssClasses: ['mshell-frame'],
    });

    this.input = new FrameInput(this.surface);
    // Windows are measured in field coordinates: the shape is a function of the layout.
    this.windows = new FrameWindows<Window>((body) => body.measure(this.field));
    // Keymode lives on the surface, focusability on every window: both are injected.
    this.keyboard = new FrameKeyboard({
      keymode: (mode) => {
        this.surface.keymode = KEYMODE[mode];
      },
      focus: (owner) => this.isolateFocus(owner),
    });
    this.field.configure(() => snapshot(this.style));
    this.field.rects = () => {
      // Single pass: the scene draws visible bodies, input may be wider
      // (for a closed hover zone it includes the lip and the frame strip up to the edge).
      const { rects, inputs } = this.windows.measure();
      this.input.sync(inputs);
      return rects;
    };
    this.field.add_css_class('frame-shape');
    this.field.hexpand = true;
    this.field.vexpand = true;

    const overlay = new Gtk.Overlay();
    this.overlay = overlay;
    overlay.set_child(this.field);
    this.fixed.hexpand = true;
    this.fixed.vexpand = true;
    overlay.add_overlay(this.fixed); // under the sliding windows

    // Motion is created before the windows: their subscribe calls motion.poke().
    this.motion = new FrameMotion({
      field: this.field,
      fixed: this.fixed,
      style: () => snapshot(this.style),
      bodies: () => this.windows.bodies(),
    });

    for (const spec of floats) {
      this.addFloat(spec);
    }
    for (const spec of pops) {
      this.addPop(spec);
    }

    // Overlay places children on any size change of any window inside -
    // it is a free hook "content changed size, the shape must be updated".
    overlay.connect('get-child-position', () => {
      this.motion.poke();
      return false;
    });

    this.surface.set_child(overlay);

    // One controller for the whole window: each hover window checks only its own
    // input bounds and fires only its own enter/leave.
    const motion = new Gtk.EventControllerMotion();
    const check = (_motion: Gtk.EventControllerMotion, x: number, y: number) =>
      this.probe(x, y);
    motion.connect('motion', check);
    motion.connect('enter', check);
    motion.connect('leave', () => {
      for (const body of this.windows.bodies()) {
        body.hoverOut();
      }
    });
    this.surface.add_controller(motion);

    this.surface.connect('map', () => {
      this.input.reset();

      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        for (const body of this.windows.bodies()) {
          if (body instanceof Pop) {
            body.prewarm();
          }
        }
        return GLib.SOURCE_REMOVE;
      });

      this.motion.poke();
    });
    this.surface.present();
  }

  // ───────────────────────── control ─────────────────────────

  open(id: string) {
    this.windows.get(id)?.open();
    this.motion.tick();
  }

  close(id: string) {
    this.windows.get(id)?.close();
    this.motion.tick();
  }

  toggle(id: string) {
    const body = this.windows.get(id);
    if (!body) {
      return;
    }
    body.toggle();
    this.motion.tick();
  }

  closeAll() {
    for (const body of this.windows.bodies()) {
      body.close();
    }
    this.motion.tick();
  }

  /** Apply the current config: durations and paddings, poke() will update the shape. */
  refresh() {
    this.windows.apply();
    this.motion.poke();
  }

  destroy() {
    this.windows.dispose();
    this.surface.destroy();
  }

  // ───────────────────────── windows ─────────────────────────

  /** Add a popover; can be called after the frame is initialized. */
  addPop(spec: PopSpec) {
    this.addWindow(
      spec.id,
      () =>
        new Pop(
          spec,
          () => snapshot(this.style),
          () => this.activate(spec.id),
          this.host,
        ),
      (pop) => this.overlay.add_overlay(pop.widget),
    );
  }

  /** Add a Float; can be called after the frame is initialized. */
  addFloat(spec: FloatSpec) {
    this.addWindow(
      spec.id,
      () => new Float(spec, () => snapshot(this.style), this.host),
      (float) => this.fixed.put(float.revealer, float.x, float.y),
    );
  }

  /** Remove a window together with its content and subscriptions. */
  remove(id: string) {
    const body = this.windows.get(id);

    if (!this.windows.remove(id)) {
      return;
    }

    if (body instanceof Pop) {
      this.overlay.remove_overlay(body.widget);
    } else if (body instanceof Float) {
      this.motion.forget(body);
      this.fixed.remove(body.revealer);
    }
    this.motion.poke();
  }

  /** Whether this frame has a window with this id. */
  has(id: string): boolean {
    return this.windows.has(id);
  }

  /** Common add path: unique id, shape subscription, insertion. */
  private addWindow<T extends Window>(
    id: string,
    create: () => T,
    mount: (body: T) => void,
  ) {
    // The registry rejects a duplicate id; the mount must not run in that case.
    if (this.windows.has(id)) {
      throw new Error(`duplicate window id: ${id}`);
    }

    const body = create();
    this.windows.add(body, () => this.motion.poke());
    mount(body);
    this.motion.poke();
  }

  // ───────────────────────── field ─────────────────────────

  /** Only the specified window remains focusable. */
  private isolateFocus(owner: string | null) {
    for (const body of this.windows.bodies()) {
      body.setFocusable(body.id === owner);
    }
  }

  private probe(x: number, y: number) {
    for (const body of this.windows.bodies()) {
      body.probe(x, y, this.surface);
    }
  }

  /** A popover opened: other exclusive windows close unless pinned. */
  private activate(activeId: string) {
    for (const body of this.windows.bodies()) {
      if (body.id !== activeId && body.exclusive) {
        body.dismiss();
      }
    }
  }
}
