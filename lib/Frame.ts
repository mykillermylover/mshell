import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';

import { type Reactive } from './config';
import { Float, type FloatSpec } from './Float';
import { FrameInput } from './FrameInput';
import { FrameMotion } from './FrameMotion';
import { type FieldStyle, LiquidField, type Rect } from './LiquidField';
import { Pop, type PopSpec } from './Pop';

export type { FloatSpec } from './Float';
export type { Edge, PopSpec } from './Pop';

export type FrameStyle = FieldStyle;

/**
 * Хост поля на один монитор:
 *   Overlay
 *    ├─ LiquidField  — рисует рамку и ВСЕ окна как единое поле (форма = то, что лежит в раскладке)
 *    ├─ Fixed      — плавающие окна (в Revealer'ах)
 *    └─ Revealer×N — окна, выезжающие из краёв
 * Окна прозрачны и рисуют только содержимое; фон за них рисует LiquidField.
 * Каждый кадр форма берётся из реальных границ Revealer'ов, поэтому анимация и форма не расходятся.
 */
export class Frame {
  readonly window: Astal.Window;
  readonly connector: string | null;
  private field = new LiquidField();
  private fixed = new Gtk.Fixed();
  private pops = new Map<string, Pop>();
  private floats = new Map<string, Float>();
  private readonly input: FrameInput;
  private readonly motion: FrameMotion;

  /** Узкий доступ для debug-команд; см. lib/debug.ts. */
  readonly debug = {
    float: (id: string) => this.floats.get(id),
    size: () => ({ w: this.field.get_width(), h: this.field.get_height() }),
    border: () => this.style.border(),
    rects: () => this.rects(),
    reveal: (float: Float) => {
      float.revealer.reveal_child = true;
    },
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

  /** Обработано тиков — для debug-команды frames. */
  get frames(): number {
    return this.motion.frames;
  }

  constructor(
    readonly monitor: Gdk.Monitor,
    pops: PopSpec[],
    floats: FloatSpec[],
    private style: Reactive<FrameStyle>,
  ) {
    this.connector = monitor.get_connector();
    const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor;

    this.window = new Astal.Window({
      application: app,
      namespace: 'frame', // для layerrule в Hyprland
      gdkmonitor: monitor,
      anchor: TOP | BOTTOM | LEFT | RIGHT,
      exclusivity: Astal.Exclusivity.IGNORE, // место под рамку резервирует композитор (gaps_out)
      layer: Astal.Layer.TOP,
      keymode: Astal.Keymode.ON_DEMAND, // чтобы в окнах работал ввод с клавиатуры
      cssClasses: ['frame'],
    });

    this.input = new FrameInput(this.window);
    this.field.cfg = style;
    this.field.rects = () => {
      const rects = this.rects();
      this.input.sync(rects);
      return rects;
    };
    this.field.add_css_class('frame-shape');
    this.field.hexpand = true;
    this.field.vexpand = true;

    const overlay = new Gtk.Overlay();
    overlay.set_child(this.field);
    this.fixed.hexpand = true;
    this.fixed.vexpand = true;
    overlay.add_overlay(this.fixed); // под выезжающими окнами

    // Motion создаётся до окон: их reveal-колбэки зовут motion.poke().
    this.motion = new FrameMotion({
      field: this.field,
      fixed: this.fixed,
      style,
      floats: this.floats,
      revealers: () => this.revealers(),
      boundsOf: (revealer) => this.boundsOf(revealer),
    });

    for (const spec of floats) {
      this.addFloat(spec);
    }
    for (const spec of pops) {
      overlay.add_overlay(this.addPop(spec));
    }

    // Overlay размещает детей при любом изменении размера любого окна внутри —
    // это бесплатный хук «контент поменял размер, форму надо обновить».
    overlay.connect('get-child-position', () => {
      this.motion.poke();
      return false;
    });

    this.window.set_child(overlay);
    // Пустой регион ввода нужен сразу: иначе слой перехватит все клики.
    this.window.connect('map', () => {
      this.input.reset();
      this.motion.poke();
    });
    this.window.present();
  }

  // ───────────────────────── управление ─────────────────────────

  open(id: string) {
    const pop = this.pops.get(id);
    if (pop) {
      for (const [otherId, other] of this.pops) {
        if (otherId !== id) {
          other.revealer.reveal_child = false;
        }
      }
      pop.revealer.reveal_child = true;
    } else {
      this.floats.get(id)?.revealer.set_reveal_child(true);
    }
    this.motion.tick();
  }

  close(id: string) {
    const revealer =
      this.pops.get(id)?.revealer ?? this.floats.get(id)?.revealer;
    if (revealer) {
      revealer.reveal_child = false;
    }
    this.motion.tick();
  }

  toggle(id: string) {
    const revealer =
      this.pops.get(id)?.revealer ?? this.floats.get(id)?.revealer;
    if (revealer) {
      if (revealer.reveal_child) {
        this.close(id);
      } else {
        this.open(id);
      }
    }
  }

  closeAll() {
    for (const id of [...this.pops.keys(), ...this.floats.keys()]) {
      this.close(id);
    }
  }

  /** Применить текущий конфиг: длительности и отступы, форму обновит poke(). */
  refresh() {
    for (const pop of this.pops.values()) {
      pop.apply();
    }
    for (const float of this.floats.values()) {
      float.apply();
    }
    this.motion.poke();
  }

  destroy() {
    this.window.destroy();
  }

  // ───────────────────────── окна ─────────────────────────

  private addPop(spec: PopSpec): Gtk.Revealer {
    const pop = new Pop(
      spec,
      () => ({
        border: this.style.border(),
        screenRadius: this.style.screenRadius(),
        revealDuration: this.style.revealDuration(),
      }),
      () => this.motion.poke(),
    );
    this.pops.set(spec.id, pop);
    return pop.revealer;
  }

  private addFloat(spec: FloatSpec) {
    const float = new Float(
      spec,
      () => this.close(spec.id),
      () => this.motion.poke(),
      () => this.style.revealDuration(),
    );
    this.fixed.put(float.revealer, float.x, float.y);
    this.floats.set(spec.id, float);
  }

  // ───────────────────────── поле ─────────────────────────

  private revealers(): Gtk.Revealer[] {
    return [
      ...[...this.pops.values()].map((pop) => pop.revealer),
      ...[...this.floats.values()].map((float) => float.revealer),
    ];
  }

  /** Границы тела в координатах поля; null, если оно ещё не разложено. */
  private boundsOf(revealer: Gtk.Revealer): Rect | null {
    const [ok, bounds] = revealer.compute_bounds(this.field);
    if (!ok || bounds.get_width() < 1 || bounds.get_height() < 1) {
      return null;
    }
    return {
      x: bounds.get_x(),
      y: bounds.get_y(),
      w: bounds.get_width(),
      h: bounds.get_height(),
    };
  }

  /** Тела поля в координатах поля. Больше никаких ключей: жидкость — функция раскладки. */
  private rects(): Rect[] {
    return this.revealers()
      .map((revealer) => this.boundsOf(revealer))
      .filter((rect): rect is Rect => rect !== null);
  }
}
