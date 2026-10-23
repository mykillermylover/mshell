import { type FieldStyle, type Reactive, snapshot } from '@lib/config';
import type { Rect } from '@lib/liquid/geometry';
import { LiquidField } from '@lib/liquid/LiquidField';
import type { FloatSpec, PopSpec, WindowHost } from '@lib/windows/api';
import { Float } from '@lib/windows/Float';
import { Pop } from '@lib/windows/Pop';
import type { Window } from '@lib/windows/window';
import type { Gdk } from 'ags/gtk4';
import { Astal, Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import GLib from 'gi://GLib';

import { FrameInput } from './FrameInput';
import { FrameMotion } from './FrameMotion';

/**
 * Хост поля на один монитор:
 *   Overlay
 *    ├─ LiquidField - рисует рамку и ВСЕ окна как единое поле (форма = то, что лежит в раскладке)
 *    ├─ Fixed - плавающие окна (Float)
 *    └─ Pop×N - компоненты попапов (Box из Revealer'а и hover-зоны)
 * Окна прозрачны и рисуют только содержимое; фон за них рисует LiquidField.
 * Каждый кадр форма берётся из Frame.measure() (Window.measure), поэтому
 * анимация и форма не расходятся.
 */
export class Frame {
  readonly surface: Astal.Window;
  readonly connector: string | null;
  private field = new LiquidField();
  private fixed = new Gtk.Fixed();
  private windows = new Map<string, Window>();
  private readonly host: WindowHost;
  private readonly overlay: Gtk.Overlay;
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
    rects: () => this.measure().rects,
    inputs: () => this.measure().inputs,
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

  /** Обработано тиков - для debug-команды frames. */
  get frames(): number {
    return this.motion.frames;
  }

  constructor(
    readonly monitor: Gdk.Monitor,
    pops: PopSpec[],
    floats: FloatSpec[],
    private style: Reactive<FieldStyle>,
  ) {
    this.connector = monitor.get_connector();
    this.host = {
      monitor,
      addFloat: (spec) => this.addFloat(spec),
      remove: (id) => this.remove(id),
    };
    const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor;

    this.surface = new Astal.Window({
      application: app,
      namespace: 'frame', // для layerrule в Hyprland
      gdkmonitor: monitor,
      anchor: TOP | BOTTOM | LEFT | RIGHT,
      exclusivity: Astal.Exclusivity.IGNORE, // место под рамку резервирует композитор (gaps_out)
      layer: Astal.Layer.TOP,
      keymode: Astal.Keymode.ON_DEMAND, // чтобы в окнах работал ввод с клавиатуры
      cssClasses: ['frame'],
    });

    this.input = new FrameInput(this.surface);
    this.field.cfg = style;
    this.field.rects = () => {
      // Один проход: сцена рисует видимые тела, input может быть шире
      // (у закрытой hover-зоны он включает губу и полосу рамки до края).
      const { rects, inputs } = this.measure();
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
      this.addPop(spec);
    }

    // Overlay размещает детей при любом изменении размера любого окна внутри -
    // это бесплатный хук «контент поменял размер, форму надо обновить».
    overlay.connect('get-child-position', () => {
      this.motion.poke();
      return false;
    });

    this.surface.set_child(overlay);

    // Один контроллер на всё окно: каждое hover-окно проверяет только свои
    // input-границы и дёргает только свои enter/leave.
    const motion = new Gtk.EventControllerMotion();
    const check = (_motion: Gtk.EventControllerMotion, x: number, y: number) =>
      this.probe(x, y);
    motion.connect('motion', check);
    motion.connect('enter', check);
    motion.connect('leave', () => {
      for (const body of this.windows.values()) {
        body.hoverOut();
      }
    });
    this.surface.add_controller(motion);

    // Пустой регион ввода нужен сразу: иначе слой перехватит все клики.
    this.surface.connect('map', () => {
      this.input.reset();
      // Пустой регион сразу: до первого снапшота слой не должен ловить клики.
      this.input.sync([]);

      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        for (const body of this.windows.values()) {
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

  // ───────────────────────── управление ─────────────────────────

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
    this.surface.destroy();
  }

  // ───────────────────────── окна ─────────────────────────

  /** Добавить попап; можно звать после инициализации кадра. */
  addPop(spec: PopSpec) {
    if (this.windows.has(spec.id)) {
      throw new Error(`duplicate window id: ${spec.id}`);
    }

    const pop = new Pop(
      spec,
      () => snapshot(this.style),
      () => this.activate(spec.id),
      this.host,
    );
    pop.subscribe(() => this.motion.poke());
    this.overlay.add_overlay(pop.widget);
    this.windows.set(spec.id, pop);
    this.motion.poke();
  }

  /** Добавить Float; можно звать после инициализации кадра. */
  addFloat(spec: FloatSpec) {
    if (this.windows.has(spec.id)) {
      throw new Error(`duplicate window id: ${spec.id}`);
    }

    const float = new Float(spec, () => snapshot(this.style), this.host);
    float.subscribe(() => this.motion.poke());
    this.fixed.put(float.revealer, float.x, float.y);
    this.windows.set(spec.id, float);
    this.motion.poke();
  }

  /** Убрать окно вместе с контентом и подписками. */
  remove(id: string) {
    const body = this.windows.get(id);
    if (!body) {
      return;
    }

    this.windows.delete(id);
    if (body instanceof Pop) {
      this.overlay.remove_overlay(body.widget);
    } else if (body instanceof Float) {
      this.motion.forget(body);
      this.fixed.remove(body.revealer);
    }
    body.dispose();
    this.motion.poke();
  }

  private probe(x: number, y: number) {
    for (const body of this.windows.values()) {
      body.probe(x, y, this.surface);
    }
  }

  /** Открылся попап: остальные эксклюзивные окна закрываются, если не закреплены. */
  private activate(activeId: string) {
    for (const body of this.windows.values()) {
      if (body.id !== activeId && body.exclusive) {
        body.dismiss();
      }
    }
  }

  /** Есть ли окно с таким id в этом кадре. */
  has(id: string): boolean {
    return this.windows.has(id);
  }

  // ───────────────────────── поле ─────────────────────────

  /** Все тела поля: попапы и флоаты. */
  private bodies(): Window[] {
    return [...this.windows.values()];
  }

  /**
   * Тела и input-области в координатах поля за один проход по окнам.
   * Больше никаких ключей: жидкость - функция раскладки.
   */
  private measure(): { rects: Rect[]; inputs: Rect[] } {
    const rects: Rect[] = [];
    const inputs: Rect[] = [];

    for (const body of this.windows.values()) {
      const measured = body.measure(this.field);
      if (measured.body) {
        rects.push(measured.body);
      }
      if (measured.input) {
        inputs.push(measured.input);
      }
    }

    return { rects, inputs };
  }
}
