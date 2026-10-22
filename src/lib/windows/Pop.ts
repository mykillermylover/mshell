import type { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import { type Edge, type EdgeAlign, hoverInput, popLayout } from './popLayout';
import { buildPopRevealer, buildPopSlot, type PopSlot } from './popSlot';
import type { Content } from './ui';
import { Window } from './window';

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

/**
 * Слот рамки: геометрия тела и правила hover. GTK-механика (Revealer'ы,
 * зона, подписки, контроллер движения) — в popSlot.ts; открытость, pin
 * и api — в Window.
 */
export class Pop extends Window {
  readonly widget: Gtk.Box;
  private readonly slot: PopSlot;
  private readonly hover: HoverSpec | null;

  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
      hoverDepth: number;
      hoverDelay: number;
      hideDelay: number;
    },
    root: Gtk.Widget,
    onActivate: () => void,
  ) {
    const hoverSpec = spec.hover === true ? {} : (spec.hover ?? null);
    const revealer = buildPopRevealer(spec.edge);
    super({
      id: spec.id,
      content: spec.content,
      revealer,
      activate: onActivate,
      delays: hoverSpec
        ? () => ({ open: style().hoverDelay, hide: style().hideDelay })
        : undefined,
    });

    this.hover = hoverSpec;
    this.slot = buildPopSlot({
      edge: spec.edge,
      layout: this.layout(),
      revealer,
      content: this.contentWidget,
      hover: hoverSpec
        ? {
            root,
            content: (hoverSpec.content?.() as Gtk.Widget | undefined) ?? null,
            hideOnReveal: hoverSpec.hideOnReveal ?? false,
            bounds: () => this.inputBounds(root),
            enter: () => this.enter(),
            leave: () => this.leave(),
          }
        : null,
    });
    this.widget = this.slot.widget;
    this.apply();
  }

  get animating(): boolean {
    return this.slot.animating;
  }

  subscribe(fn: () => void): () => void {
    return this.slot.subscribe(fn);
  }

  /**
   * Видимое тело: всё, кроме полосы рамки (`spacer`). Рамку рисует
   * LiquidField, поэтому в тело поля она не входит. Иначе тело перекрывает
   * кромку, мостик к рамке вырождается (gap < 0), и при сужении тела нормаль
   * переворачивается — в конце закрытия эффект скачет.
   */
  bounds(relativeTo: Gtk.Widget): Rect | null {
    const rect = this.slot.bounds(relativeTo);
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
    const raw = this.slot.bounds(relativeTo);
    if (!raw) {
      return null;
    }
    if (!this.hover) {
      return raw;
    }

    const rect = this.bodyRect(raw);

    // Полностью открыт: только тело; уход на рамку должен давать leave.
    if (this.slot.revealed) {
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

  /** Применить длительности и раскладку по текущему конфигу. */
  apply() {
    const style = this.style();
    this.slot.apply(style.revealDuration, this.layout(style));
  }
}
