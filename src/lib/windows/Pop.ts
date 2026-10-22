import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { boundsOf, type WindowBody } from './body';
import { type Edge, type EdgeAlign, hoverInput, popLayout } from './popLayout';
import { type Content, padded } from './ui';

export interface HoverSpec {
  depth?: number; // толщина губы/input, px (>= 1); по умолчанию style.hoverDepth
  content?: Content; // компонент внутри зоны
  hideOnReveal?: boolean; // скрыть зону, пока попап раскрыт
}

/** Окно, выезжающее из края рамки (открывается/закрывается). */
export interface PopSpec {
  id: string;
  edge: Edge;
  align?: EdgeAlign; // положение вдоль края
  content: Content; // вызывается по разу на монитор; фон НЕ задавать
  hover?: true | HoverSpec; // true — дефолтные значения; нет — без hover
}

export interface HoverCallbacks {
  enter(): void;
  leave(): void;
}

const SLIDE = {
  top: Gtk.RevealerTransitionType.SLIDE_DOWN,
  bottom: Gtk.RevealerTransitionType.SLIDE_UP,
  left: Gtk.RevealerTransitionType.SLIDE_RIGHT,
  right: Gtk.RevealerTransitionType.SLIDE_LEFT,
};

// Зона уезжает в сторону, противоположную попапу: она на дальней кромке.
const ZONE_SLIDE = {
  top: Gtk.RevealerTransitionType.SLIDE_UP,
  bottom: Gtk.RevealerTransitionType.SLIDE_DOWN,
  left: Gtk.RevealerTransitionType.SLIDE_LEFT,
  right: Gtk.RevealerTransitionType.SLIDE_RIGHT,
};

const ALIGN = {
  start: Gtk.Align.START,
  center: Gtk.Align.CENTER,
  end: Gtk.Align.END,
};

const ORIENTATION = {
  vertical: Gtk.Orientation.VERTICAL,
  horizontal: Gtk.Orientation.HORIZONTAL,
};

/** Контент-заполнитель: пустая зона/спейсер ведут себя как обычный контент. */
const filler = () => {
  const box = new Gtk.Box();
  box.hexpand = true;
  box.vexpand = true;
  return box;
};

/**
 * Выдвижной слот рамки: попап (Revealer) у внутренней кромки и hover-зона
 * на дальней кромке. Всё — один Box. Тело поля — Box без полосы рамки;
 * input закрытой зоны — то же тело плюс полоса рамки до края экрана.
 *
 * У hover-попапа frame-side отступ — реальный spacer внутри Box, а не margin:
 * margin overlay не двигает, но съедает content box, из-за чего зона теряла
 * толщину. Сам spacer в тело поля не входит (bounds его отрезает), а input
 * закрытой зоны достраивается до края экрана.
 */
export class Pop implements WindowBody {
  readonly widget: Gtk.Box;
  readonly revealer: Gtk.Revealer;
  private readonly spacer: Gtk.Box | null;
  private readonly zone: Gtk.Box | null;
  private readonly zoneRevealer: Gtk.Revealer | null;
  private readonly spacerFiller: Gtk.Box | null;
  private readonly zoneFiller: Gtk.Box | null;
  private readonly hover: HoverSpec | null;

  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
      hoverDepth: number;
    },
    root: Gtk.Widget,
    hover: HoverCallbacks | null,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: SLIDE[spec.edge],
      revealChild: false,
    });
    revealer.set_child(padded(spec.content()));

    const hoverSpec = spec.hover === true ? {} : (spec.hover ?? null);
    this.hover = hoverSpec;
    const widget = new Gtk.Box();
    let spacer: Gtk.Box | null = null;
    let zone: Gtk.Box | null = null;
    let zoneRevealer: Gtk.Revealer | null = null;
    let spacerFiller: Gtk.Box | null = null;
    let zoneFiller: Gtk.Box | null = null;

    if (hoverSpec) {
      // Полоса рамки как часть тела: spacer, а не margin.
      spacer = new Gtk.Box();
      spacerFiller = filler();
      spacer.append(spacerFiller);

      zone = new Gtk.Box();
      zone.add_css_class('hover-zone');
      if (hoverSpec.content) {
        zone.append(hoverSpec.content() as Gtk.Widget);
      } else {
        zoneFiller = filler();
        zone.append(zoneFiller);
      }

      zoneRevealer = new Gtk.Revealer({
        transitionType: ZONE_SLIDE[spec.edge],
        revealChild: true,
      });
      zoneRevealer.set_child(zone);
    }

    const layout = this.layout();
    const parts = {
      spacer,
      revealer,
      zone: zoneRevealer,
    };

    for (const part of layout.children) {
      const child = parts[part];
      if (child) {
        widget.append(child);
      }
    }

    if (hoverSpec && hover) {
      // Input = тело + полоса рамки, поэтому hover считаем на окне по
      // inputBounds: пустые дети не дают enter, а region меняется с зоной.
      let inside = false;
      const check = (x: number, y: number) => {
        const rect = this.inputBounds(root);
        const now =
          rect !== null &&
          x >= rect.x &&
          x < rect.x + rect.w &&
          y >= rect.y &&
          y < rect.y + rect.h;

        if (now === inside) {
          return;
        }

        inside = now;
        if (now) {
          hover.enter();
        } else {
          hover.leave();
        }
      };

      const motion = new Gtk.EventControllerMotion();
      motion.connect(
        'motion',
        (_motion: Gtk.EventControllerMotion, x: number, y: number) =>
          check(x, y),
      );
      motion.connect(
        'enter',
        (_motion: Gtk.EventControllerMotion, x: number, y: number) =>
          check(x, y),
      );
      motion.connect('leave', () => {
        if (inside) {
          inside = false;
          hover.leave();
        }
      });
      root.add_controller(motion);
    }

    if (zoneRevealer) {
      // hideOnReveal: зона уезжает сразу с началом открытия (SLIDE, без
      // fade) и возвращается с началом закрытия.
      const sync = () => {
        if (!hoverSpec!.hideOnReveal) {
          zoneRevealer!.reveal_child = true;
          return;
        }
        zoneRevealer!.reveal_child = !revealer.reveal_child;
      };
      revealer.connect('notify::reveal-child', sync);
      sync();
    }

    this.widget = widget;
    this.revealer = revealer;
    this.spacer = spacer;
    this.zone = zone;
    this.zoneRevealer = zoneRevealer;
    this.spacerFiller = spacerFiller;
    this.zoneFiller = zoneFiller;
    this.apply();
  }

  get open(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    const popup = this.revealer.reveal_child !== this.revealer.child_revealed;
    const zone =
      this.zoneRevealer !== null &&
      this.zoneRevealer.reveal_child !== this.zoneRevealer.child_revealed;
    return popup || zone;
  }

  setOpen(open: boolean) {
    this.revealer.reveal_child = open;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  subscribe(fn: () => void): () => void {
    const connections: Array<[Gtk.Revealer, number]> = [];

    for (const target of [this.revealer, this.zoneRevealer]) {
      if (!target) {
        continue;
      }
      connections.push(
        [target, target.connect('notify::reveal-child', fn)],
        [target, target.connect('notify::child-revealed', fn)],
      );
    }

    return () => {
      for (const [target, id] of connections) {
        target.disconnect(id);
      }
    };
  }

  /**
   * Видимое тело: всё, кроме полосы рамки (`spacer`). Рамку рисует
   * LiquidField, поэтому в тело поля она не входит. Иначе тело перекрывает
   * кромку, мостик к рамке вырождается (gap < 0), и при сужении тела нормаль
   * переворачивается — в конце закрытия эффект скачет.
   */
  bounds(relativeTo: Gtk.Widget): Rect | null {
    const rect = boundsOf(this.widget, relativeTo);
    if (!rect || !this.hover) {
      return rect;
    }

    const body = this.bodyRect(rect);
    return body.w >= 1 && body.h >= 1 ? body : null;
  }

  /** Тело без полосы рамки; нулевое при `depth = 0` (невидимая зона). */
  private bodyRect(rect: Rect): Rect {
    const { border } = this.style();
    switch (this.spec.edge) {
      case 'top': {
        return { ...rect, y: rect.y + border, h: rect.h - border };
      }
      case 'bottom': {
        return { ...rect, h: rect.h - border };
      }
      case 'left': {
        return { ...rect, x: rect.x + border, w: rect.w - border };
      }
      default: {
        return { ...rect, w: rect.w - border };
      }
    }
  }

  /**
   * Input закрытой зоны = губа + полоса рамки до края экрана. Открытой —
   * только тело. `depth = 0` выключает ховер: input нет.
   */
  inputBounds(relativeTo: Gtk.Widget): Rect | null {
    const raw = boundsOf(this.widget, relativeTo);
    if (!raw) {
      return null;
    }
    if (!this.hover) {
      return raw;
    }

    const rect = this.bodyRect(raw);

    // Полностью открыт: только тело; уход на рамку должен давать leave.
    if (this.revealer.child_revealed) {
      return rect;
    }
    return hoverInput(rect, this.spec.edge, this.style().border);
  }

  /** Толщина губы по текущему конфигу. */
  private depth(style = this.style()) {
    if (!this.hover) {
      return 0;
    }
    return Math.max(1, this.hover.depth ?? style.hoverDepth);
  }

  /** Раскладка по текущему конфигу. */
  private layout(style = this.style()) {
    return popLayout(
      this.spec.edge,
      this.spec.align ?? 'center',
      { border: style.border, screenRadius: style.screenRadius },
      this.depth(style),
      Boolean(this.hover),
    );
  }

  /** Переставить слот, зону и обновить длительности по текущему конфигу. */
  apply() {
    const style = this.style();
    const layout = this.layout(style);

    this.revealer.transitionDuration = style.revealDuration;
    if (this.zoneRevealer) {
      this.zoneRevealer.transitionDuration = style.revealDuration;
    }

    this.widget.orientation = ORIENTATION[layout.orientation];
    this.widget.halign = ALIGN[layout.anchor.halign];
    this.widget.valign = ALIGN[layout.anchor.valign];
    this.widget.marginStart = layout.anchor.marginStart;
    this.widget.marginEnd = layout.anchor.marginEnd;
    this.widget.marginTop = layout.anchor.marginTop;
    this.widget.marginBottom = layout.anchor.marginBottom;

    if (this.spacer) {
      this.spacer.set_size_request(
        layout.spacer.widthRequest,
        layout.spacer.heightRequest,
      );
    }

    if (this.spacerFiller) {
      this.spacerFiller.set_size_request(
        layout.spacer.widthRequest,
        layout.spacer.heightRequest,
      );
    }

    if (this.zone) {
      this.zone.set_size_request(
        layout.zone.widthRequest,
        layout.zone.heightRequest,
      );
    }

    if (this.zoneFiller) {
      this.zoneFiller.set_size_request(
        layout.zone.widthRequest,
        layout.zone.heightRequest,
      );
    }
  }
}
