import type { Gdk } from 'ags/gtk4';
import { Gtk } from 'ags/gtk4';
import GLib from 'gi://GLib';

import { type Reactive, snapshot } from './config';
import type { Float } from './Float';
import type { FieldStyle, Rect } from './GooField';
import { snapTo } from './snap';

interface Tween {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number | null;
  duration: number;
}

// лёгкий «перелёт» при примагничивании
const easeOutBack = (t: number) =>
  1 + 3 * Math.pow(t - 1, 3) + 2 * Math.pow(t - 1, 2);

export interface MotionDeps {
  field: Gtk.Widget;
  fixed: Gtk.Fixed;
  style: Reactive<FieldStyle>;
  floats: Map<string, Float>;
  revealers: () => Gtk.Revealer[];
  boundsOf: (revealer: Gtk.Revealer) => Rect | null;
}

/** Движение окон: drag, примагничивание, твины и тик-цикл. */
export class FrameMotion {
  private drag: { float: Float; startX: number; startY: number } | null = null;
  private tweens = new Map<Float, Tween>();
  private ticking = false;
  private pokes = 0;
  /** Обработано тиков — для замеров нагрузки (CPU / кадр). */
  frames = 0;

  constructor(private readonly deps: MotionDeps) {
    this.installDrag();
  }

  /** Для debug: поставить окно и перерисовать. */
  move(float: Float, x: number, y: number) {
    this.tweens.delete(float);
    this.moveTo(float, x, y);
    this.poke();
  }

  /** Для debug: запустить твин. */
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

  /** Для drag-end и debug: примагнитить окно. */
  snap(float: Float) {
    this.snapFloat(float);
  }

  /**
   * Жест висит на неподвижном Fixed, а не на самом окне: координаты стабильны,
   * нет дрожания из-за того, что окно двигается под курсором.
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
        const hit = [...this.deps.floats.values()].find(
          (float) => inside(float.grip) && !inside(float.closeBtn),
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

  private moveTo(float: Float, x: number, y: number) {
    const fieldWidth = this.deps.field.get_width();
    const fieldHeight = this.deps.field.get_height();
    const border = this.deps.style.border();
    // Окно живёт в комнате, а не на рамке: иначе зазор к рамке становится
    // отрицательным, мостик прыгает на полную ширину, а угол теряется.
    const maxX = Math.max(
      border,
      fieldWidth - border - float.revealer.get_width(),
    );
    const maxY = Math.max(
      border,
      fieldHeight - border - float.revealer.get_height(),
    );
    float.x = Math.max(border, Math.min(x, maxX));
    float.y = Math.max(border, Math.min(y, maxY));
    this.deps.fixed.move(float.revealer, float.x, float.y);
  }

  /** Отпустили окно ближе waistReach к краю или соседу → тянем вплотную. */
  private snapFloat(float: Float) {
    const target = this.snapTarget(float);
    if (target) {
      this.tweens.set(float, {
        fromX: float.x,
        fromY: float.y,
        toX: target.x,
        toY: target.y,
        startedAt: null,
        duration: this.deps.style.snapDuration(),
      });
    }
    this.tick();
  }

  /**
   * Отпустили окно ближе waistReach к краю или соседу → оно втягивается вплотную.
   * Это та же дистанция, на которой появляются перемычки-капли: сцепились — прилипло.
   */
  private snapTarget(float: Float): { x: number; y: number } | null {
    const { border, screenRadius, waistReach, windowRadius } = snapshot(
      this.deps.style,
    );
    const others = this.deps
      .revealers()
      .filter(
        (revealer) => revealer !== float.revealer && revealer.child_revealed,
      )
      .map((revealer) => this.deps.boundsOf(revealer))
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
        reach: waistReach,
      },
      { ...float.rect, cornerRadius: windowRadius },
      others,
    );
  }

  private animating() {
    return this.deps
      .revealers()
      .some((revealer) => revealer.reveal_child !== revealer.child_revealed);
  }

  /** Перерисовать пару кадров: хватает, чтобы подхватить итоговую раскладку после изменения. */
  poke() {
    this.pokes = 2;
    this.tick();
  }

  /**
   * Тик-цикл живёт, только пока что-то движется (перетаскивание, примагничивание, анимация
   * Revealer) или пока не отработали poke(). В покое тиков нет — композитор не будят.
   */
  tick() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    this.deps.field.add_tick_callback(
      (_w: Gtk.Widget, clock: Gdk.FrameClock) => {
        this.frames++;
        const now = clock.get_frame_time() / 1000;
        for (const [float, tween] of this.tweens) {
          tween.startedAt ??= now;
          const progress =
            tween.duration > 0
              ? Math.min(1, (now - tween.startedAt) / tween.duration)
              : 1;
          const eased = easeOutBack(progress);
          this.moveTo(
            float,
            tween.fromX + (tween.toX - tween.fromX) * eased,
            tween.fromY + (tween.toY - tween.fromY) * eased,
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
}
