import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { boundsOf, type WindowBody } from './body';
import { blurReach, type Edge, type EdgeAlign, popLayout } from './popLayout';
import { type Content, padded } from './ui';

export type { Edge, EdgeAlign } from './popLayout';

export interface HoverSpec {
  depth?: number; // толщина зоны, px; по умолчанию style.hoverDepth
  content?: Content; // компонент внутри зоны
  hideOnReveal?: boolean; // скрыть зону, пока попап раскрыт
}

/** Окно, выезжающее из края рамки (открывается/закрывается). */
export interface PopSpec {
  id: string;
  edge: Edge;
  align?: EdgeAlign; // положение вдоль края
  content: Content; // вызывается по разу на монитор; фон НЕ задавать
  hover?: HoverSpec; // нет — попап без hover-логики
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
 * на дальней кромке. Всё — один Box; его границы идут в Frame.bodies(),
 * поэтому фон, input и hover считаются по одной геометрии.
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

  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
      hoverDepth: number;
      meltRadius: number;
    },
    root: Gtk.Widget,
    hover: HoverCallbacks | null,
  ) {
    const revealer = new Gtk.Revealer({
      transitionType: SLIDE[spec.edge],
      revealChild: false,
    });
    revealer.set_child(padded(spec.content()));

    const widget = new Gtk.Box();
    let spacer: Gtk.Box | null = null;
    let zone: Gtk.Box | null = null;
    let zoneRevealer: Gtk.Revealer | null = null;
    let spacerFiller: Gtk.Box | null = null;
    let zoneFiller: Gtk.Box | null = null;

    if (spec.hover) {
      // Полоса рамки как часть тела: spacer, а не margin.
      spacer = new Gtk.Box();
      spacerFiller = filler();
      spacer.append(spacerFiller);

      zone = new Gtk.Box();
      zone.add_css_class('hover-zone');
      if (spec.hover.content) {
        zone.append(spec.hover.content() as Gtk.Widget);
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

    if (spec.hover && hover) {
      // Input region шире тела (blurReach), поэтому hover считаем на окне
      // по inputBounds: пустые дети и blur-полоса вне тела не дают enter.
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
        if (!spec.hover!.hideOnReveal) {
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
    if (!rect || !this.spec.hover) {
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
   * Input шире видимой губы: у закрытой зоны он включает полосу рамки (до
   * края экрана) и видимую часть blur-мостика (2σ) в комнате.
   */
  inputBounds(relativeTo: Gtk.Widget): Rect | null {
    const raw = boundsOf(this.widget, relativeTo);
    if (!raw) {
      return null;
    }
    if (!this.spec.hover) {
      return raw;
    }

    // Не через bounds(): у невидимой зоны (depth = 0) тело нулевое, но input
    // всё равно нужен.
    const rect = this.bodyRect(raw);

    // Полностью открыт: тело уже покрывает blur-полосу, расширение не нужно.
    // Иначе выход в добавленные пиксели не давал бы leave.
    if (this.revealer.child_revealed) {
      return rect;
    }

    const style = this.style();
    const border = style.border;
    const extension = Math.max(
      0,
      blurReach(style.meltRadius) - this.visibleDepth(),
    );

    // frame-side всегда достраиваем до края экрана, room-side — по эффекту.
    switch (this.spec.edge) {
      case 'top': {
        return {
          ...rect,
          y: rect.y - border,
          h: rect.h + border + extension,
        };
      }
      case 'bottom': {
        return {
          ...rect,
          y: rect.y - extension,
          h: rect.h + border + extension,
        };
      }
      case 'left': {
        return {
          ...rect,
          x: rect.x - border,
          w: rect.w + border + extension,
        };
      }
      default: {
        return {
          ...rect,
          x: rect.x - extension,
          w: rect.w + border + extension,
        };
      }
    }
  }

  /** Текущая толщина видимой зоны по основной оси края. */
  private visibleDepth() {
    if (!this.zone) {
      return 0;
    }
    return this.spec.edge === 'top' || this.spec.edge === 'bottom'
      ? this.zone.get_height()
      : this.zone.get_width();
  }

  /** Раскладка по текущему конфигу. */
  private layout(style = this.style()) {
    const depth = this.spec.hover
      ? (this.spec.hover.depth ?? style.hoverDepth)
      : 0;
    return popLayout(
      this.spec.edge,
      this.spec.align ?? 'center',
      { border: style.border, screenRadius: style.screenRadius },
      depth,
      Boolean(this.spec.hover),
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
