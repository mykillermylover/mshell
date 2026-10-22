import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';

import { type Reactive } from '../config';
import { type FieldStyle, LiquidField, type Rect } from '../liquid/LiquidField';
import { Float, type FloatSpec } from '../windows/Float';
import { Pop, type PopSpec } from '../windows/Pop';
import type { Window } from '../windows/window';
import { FrameInput } from './FrameInput';
import { FrameMotion } from './FrameMotion';

export type { FloatSpec } from '../windows/Float';
export type { PopSpec } from '../windows/Pop';

export type FrameStyle = FieldStyle;

/**
 * Хост поля на один монитор:
 *   Overlay
 *    ├─ LiquidField — рисует рамку и ВСЕ окна как единое поле (форма = то, что лежит в раскладке)
 *    ├─ Fixed       — плавающие окна (Float)
 *    └─ Pop×N       — компоненты попапов (Box из Revealer'а и hover-зоны)
 * Окна прозрачны и рисуют только содержимое; фон за них рисует LiquidField.
 * Каждый кадр форма берётся из Frame.bodies() (Window.bounds), поэтому
 * анимация и форма не расходятся.
 */
export class Frame {
  readonly window: Astal.Window;
  readonly connector: string | null;
  private field = new LiquidField();
  private fixed = new Gtk.Fixed();
  private windows = new Map<string, Window>();
  private readonly input: FrameInput;
  private readonly motion: FrameMotion;

  /** Узкий доступ для debug-команд; см. lib/debug.ts. */
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
    rects: () => this.rects(),
    inputs: () => this.inputs(),
    region: () => this.input.boxes,
    reveal: (float: Float) => {
      float.open();
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
      // Сцена рисует видимые тела, а input может быть шире: у закрытой
      // hover-зоны он включает губу и полосу рамки до края экрана.
      this.input.sync(this.inputs());
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

    // Motion создаётся до окон: их subscribe зовёт motion.poke().
    this.motion = new FrameMotion({
      field: this.field,
      fixed: this.fixed,
      style,
      bodies: () => this.bodies(),
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
    this.body(id)?.open();
    this.motion.tick();
  }

  close(id: string) {
    this.body(id)?.close();
    this.motion.tick();
  }

  toggle(id: string) {
    const body = this.body(id);
    if (!body) {
      return;
    }
    if (body.isOpen) {
      body.close();
    } else {
      body.open();
    }
    this.motion.tick();
  }

  closeAll() {
    for (const body of this.bodies()) {
      body.close();
    }
    this.motion.tick();
  }

  /** Применить текущий конфиг: длительности и отступы, форму обновит poke(). */
  refresh() {
    for (const body of this.windows.values()) {
      body.apply();
    }
    this.motion.poke();
  }

  destroy() {
    for (const body of this.bodies()) {
      body.dispose();
    }
    this.window.destroy();
  }

  // ───────────────────────── окна ─────────────────────────

  private addPop(spec: PopSpec): Gtk.Widget {
    const pop = new Pop(
      spec,
      () => ({
        border: this.style.border(),
        screenRadius: this.style.screenRadius(),
        revealDuration: this.style.revealDuration(),
        hoverDepth: this.style.hoverDepth(),
        hoverDelay: this.style.hoverDelay(),
        hideDelay: this.style.hideDelay(),
      }),
      this.window,
      () => this.activate(spec.id),
    );
    pop.subscribe(() => this.motion.poke());
    this.windows.set(spec.id, pop);
    return pop.widget;
  }

  private addFloat(spec: FloatSpec) {
    const float = new Float(spec, () => this.style.revealDuration());
    float.subscribe(() => this.motion.poke());
    this.fixed.put(float.revealer, float.x, float.y);
    this.windows.set(spec.id, float);
  }

  /** Открылся попап: остальные закрываются, если не закреплены. */
  private activate(activeId: string) {
    for (const body of this.windows.values()) {
      if (body.id !== activeId && body instanceof Pop) {
        body.dismiss();
      }
    }
  }

  private body(id: string): Window | undefined {
    return this.windows.get(id);
  }

  // ───────────────────────── поле ─────────────────────────

  /** Все тела поля: попапы и флоаты. */
  private bodies(): Window[] {
    return [...this.windows.values()];
  }

  /** Тела поля в координатах поля. Больше никаких ключей: жидкость — функция раскладки. */
  private rects(): Rect[] {
    return this.bodies()
      .map((body) => body.bounds(this.field))
      .filter((rect): rect is Rect => rect !== null);
  }

  /** Input region: может быть шире тел (hover blur reach). */
  private inputs(): Rect[] {
    return this.bodies()
      .map((body) => body.inputBounds(this.field))
      .filter((rect): rect is Rect => rect !== null);
  }
}
