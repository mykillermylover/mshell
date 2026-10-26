import type { FieldStyle } from '@lib/config';
import type { Rect } from '@lib/geometry';
import { snapTo } from '@lib/snap';
import { Float } from '@lib/windows/Float';
import type { Window } from '@lib/windows/window';
import type { Gdk } from 'ags/gtk4';
import { Gtk } from 'ags/gtk4';
import GLib from 'gi://GLib';

import { easeOutBack } from './easing';

/**
 * The cursor is over something clickable (button, gesture click/drag area):
 * dragging by the header must not steal its click. Walks up to the grip inclusive.
 */
function interactive(hit: Gtk.Widget | null, stop: Gtk.Widget): boolean {
  for (let widget = hit; widget; widget = widget.get_parent()) {
    if (widget instanceof Gtk.Button) {
      return true;
    }
    const controllers = widget.observe_controllers();
    for (let i = 0; i < controllers.get_n_items(); i++) {
      if (controllers.get_item(i) instanceof Gtk.GestureSingle) {
        return true;
      }
    }
    if (widget === stop) {
      break;
    }
  }
  return false;
}

interface Tween {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number | null;
  duration: number;
}

/** How many frames to keep ticking after a layout change. */
const POKE_FRAMES = 2;
/** GdkFrameClock returns microseconds; tweens and delays are in milliseconds. */
const US_PER_MS = 1000;

export interface MotionDeps {
  field: Gtk.Widget;
  fixed: Gtk.Fixed;
  style: () => FieldStyle;
  bodies: () => Window[];
}

/** Window movement: drag, snapping, tweens and the tick loop. */
export class FrameMotion {
  private drag: { float: Float; startX: number; startY: number } | null = null;
  private tweens = new Map<Float, Tween>();
  private ticking = false;
  private pokes = 0;
  /** Processed ticks - for the debug frames command. */
  tickCount = 0;

  constructor(private readonly deps: MotionDeps) {
    this.installDrag();
  }

  /** For debug: place the window and redraw. */
  move(float: Float, x: number, y: number) {
    this.tweens.delete(float);
    this.moveTo(float, x, y);
    this.poke();
  }

  /** For debug: start a tween. */
  tween(
    float: Float,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration: number,
  ) {
    this.tweens.set(float, {
      fromX,
      fromY,
      toX,
      toY,
      startedAt: null,
      duration,
    });
    this.tick();
  }

  /** For drag-end and debug: snap the window. */
  snap(float: Float) {
    this.snapFloat(float);
  }

  /** The window is being removed: forget its tween and drag so we do not move a deleted widget. */
  forget(float: Float) {
    this.tweens.delete(float);
    if (this.drag?.float === float) {
      this.drag = null;
    }
  }

  /** Redraw for a couple of frames: enough to pick up the final layout after a change. */
  poke() {
    this.pokes = POKE_FRAMES;
    this.tick();
  }

  /**
   * The tick loop lives only while something is moving (dragging, snapping, Revealer
   * animation) or until poke() has run out. At rest there are no ticks - the compositor is not woken.
   */
  tick() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    this.deps.field.add_tick_callback(
      (_w: Gtk.Widget, clock: Gdk.FrameClock) => {
        this.tickCount++;
        const now = clock.get_frame_time() / US_PER_MS;
        const fieldWidth = this.deps.field.get_width();
        const fieldHeight = this.deps.field.get_height();
        for (const [float, tween] of this.tweens) {
          tween.startedAt ??= now;
          const progress =
            tween.duration > 0
              ? Math.min(1, (now - tween.startedAt) / tween.duration)
              : 1;
          const eased = easeOutBack(progress);
          const x = tween.fromX + (tween.toX - tween.fromX) * eased;
          const y = tween.fromY + (tween.toY - tween.fromY) * eased;
          // The easeOutBack overshoot must go past the frame and past the neighbor, therefore
          // we do not reserve space during the tween - only the layer surface.
          this.place(
            float,
            Math.max(0, Math.min(x, fieldWidth - float.revealer.get_width())),
            Math.max(0, Math.min(y, fieldHeight - float.revealer.get_height())),
          );
          if (progress >= 1) {
            this.tweens.delete(float);
          }
        }
        this.deps.field.queue_draw();

        const busy =
          !!this.drag ||
          this.tweens.size > 0 ||
          this.animating() ||
          this.pokes > 0;
        if (this.pokes > 0) {
          this.pokes--;
        }
        if (!busy) {
          this.ticking = false;
          return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
      },
    );
  }

  /**
   * The gesture lives on the stationary Fixed, not on the window itself: coordinates are stable,
   * no jitter from the window moving under the cursor.
   */
  private installDrag() {
    const gesture = new Gtk.GestureDrag();
    gesture.connect(
      'drag-begin',
      (_gesture: Gtk.GestureDrag, startX: number, startY: number) => {
        const picked = this.deps.fixed.pick(
          startX,
          startY,
          Gtk.PickFlags.DEFAULT,
        );
        const inside = (ancestor: Gtk.Widget) =>
          !!picked && (picked === ancestor || picked.is_ancestor(ancestor));
        const hit = this.deps
          .bodies()
          .filter((body): body is Float => body instanceof Float)
          .find(
            (float) => inside(float.grip) && !interactive(picked, float.grip),
          );
        if (!hit) {
          gesture.set_state(Gtk.EventSequenceState.DENIED);
          return;
        }
        this.tweens.delete(hit);
        this.raise(hit);
        this.drag = { float: hit, startX: hit.x, startY: hit.y };
        this.tick();
      },
    );
    gesture.connect(
      'drag-update',
      (_gesture: Gtk.GestureDrag, offsetX: number, offsetY: number) => {
        if (this.drag) {
          this.moveTo(
            this.drag.float,
            this.drag.startX + offsetX,
            this.drag.startY + offsetY,
          );
        }
      },
    );
    gesture.connect('drag-end', () => {
      const drag = this.drag;
      this.drag = null;
      if (!drag) {
        return;
      }
      this.snapFloat(drag.float);
    });
    this.deps.fixed.add_controller(gesture);
  }

  private raise(float: Float) {
    if (this.deps.fixed.get_last_child() === float.revealer) {
      return;
    }
    this.deps.fixed.remove(float.revealer);
    this.deps.fixed.put(float.revealer, float.x, float.y);
  }

  /** Place the window as is: without clamping to the interior. */
  private place(float: Float, x: number, y: number) {
    float.x = x;
    float.y = y;
    this.deps.fixed.move(float.revealer, x, y);
  }

  private moveTo(float: Float, x: number, y: number) {
    const fieldWidth = this.deps.field.get_width();
    const fieldHeight = this.deps.field.get_height();
    const border = this.deps.style().border;
    // The window lives in the interior, not on the frame: otherwise the gap to the frame becomes
    // negative and the body geometrically covers the outline.
    const maxX = Math.max(
      border,
      fieldWidth - border - float.revealer.get_width(),
    );
    const maxY = Math.max(
      border,
      fieldHeight - border - float.revealer.get_height(),
    );
    this.place(
      float,
      Math.max(border, Math.min(x, maxX)),
      Math.max(border, Math.min(y, maxY)),
    );
  }

  /** Snap the window: compute the target and start a tween. */
  private snapFloat(float: Float) {
    const target = this.snapTarget(float);
    if (target) {
      this.tweens.set(float, {
        fromX: float.x,
        fromY: float.y,
        toX: target.x,
        toY: target.y,
        startedAt: null,
        duration: this.deps.style().snapDuration,
      });
    }
    this.tick();
  }

  /**
   * Window released closer than snapReach to the edge or a neighbor → it is pulled flush.
   */
  private snapTarget(float: Float): { x: number; y: number } | null {
    const { border, screenRadius, snapReach, windowRadius } = this.deps.style();
    const self = float.measure(this.deps.field).body;
    if (!self) {
      return null;
    }

    // Neighbors are all field bodies, not just Floats: a moved-out Pop must also
    // attract the window. Closed hover lips participate deliberately: they are visible
    // popover material, and a Float must not snap "through" them or land
    // on top. Windows being animated too: their current body is the target.
    const others = this.deps
      .bodies()
      .filter((body) => body !== float)
      .map((body) => body.measure(this.deps.field).body)
      .filter((rect): rect is Rect => rect !== null)
      .map((rect) => ({ ...rect, cornerRadius: windowRadius }));

    return snapTo(
      {
        frame: {
          w: this.deps.field.get_width(),
          h: this.deps.field.get_height(),
          border,
          screenRadius,
        },
        reach: snapReach,
      },
      { ...self, cornerRadius: windowRadius },
      others,
    );
  }

  private animating() {
    return this.deps.bodies().some((body) => body.animating);
  }
}
