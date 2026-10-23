import type { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import type { FieldStyle } from '../style';
import { createWindowContent, type WindowHost } from './api';
import { type Edge, type EdgeAlign, hoverInput, popLayout } from './popLayout';
import { buildPopRevealer, buildPopSlot, type PopSlot } from './popSlot';
import { asWidget, type Content } from './ui';
import { Window, type WindowMeasure } from './window';

const noop = () => {};

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
 * Слот рамки: геометрия тела и правила hover. GTK-виджеты и подписки —
 * в popSlot.ts; контроллер движения — один на Frame; открытость, pin
 * и api — в Window.
 */
export class Pop extends Window {
  readonly widget: Gtk.Box;
  private readonly slot: PopSlot;
  private readonly hover: HoverSpec | null;
  private readonly disposeHover: () => void;
  private hovering = false;

  constructor(
    readonly spec: PopSpec,
    private style: () => FieldStyle,
    onActivate: () => void,
    host: WindowHost,
  ) {
    const hoverSpec = spec.hover === true ? {} : (spec.hover ?? null);
    const revealer = buildPopRevealer(spec.edge);
    super({
      id: spec.id,
      content: spec.content,
      revealer,
      exclusive: true,
      host,
      activate: onActivate,
      delays: hoverSpec
        ? () => ({ open: style().hoverDelay, hide: style().hideDelay })
        : undefined,
    });

    this.hover = hoverSpec;

    const hoverContent = hoverSpec
      ? createWindowContent(this.api, () =>
          hoverSpec.content ? asWidget(hoverSpec.content()) : null,
        )
      : null;
    this.disposeHover = hoverContent?.dispose ?? noop;

    this.slot = buildPopSlot({
      edge: spec.edge,
      layout: this.layout(),
      revealer,
      content: this.contentWidget,
      hover: hoverSpec
        ? {
            content: hoverContent?.content ?? null,
            hideOnReveal: hoverSpec.hideOnReveal ?? false,
          }
        : null,
    });
    this.widget = this.slot.widget;
    this.apply();
  }

  get animating(): boolean {
    return this.slot.animating;
  }

  /** Прогреть preferred size после map: первый hover не платит за раскладку. */
  prewarm() {
    this.widget.get_preferred_size();
    this.revealer.get_preferred_size();
    this.contentWidget.get_preferred_size();
  }

  dispose() {
    this.slot.cleanup();
    this.disposeHover();
    super.dispose();
  }

  /**
   * Input = тело + полоса рамки, поэтому hover считаем по measure, а не по
   * enter/leave детей: пустые дети событий не дают.
   */
  probe(x: number, y: number, relativeTo: Gtk.Widget) {
    if (!this.hover) {
      return;
    }
    const rect = this.measure(relativeTo).input;
    const now =
      rect !== null &&
      x >= rect.x &&
      x < rect.x + rect.w &&
      y >= rect.y &&
      y < rect.y + rect.h;

    if (now === this.hovering) {
      return;
    }

    this.hovering = now;
    if (now) {
      this.enter();
    } else {
      this.leave();
    }
  }

  hoverOut() {
    if (this.hovering) {
      this.hovering = false;
      this.leave();
    }
  }

  subscribe(fn: () => void): () => void {
    return this.slot.subscribe(fn);
  }

  /**
   * Видимое тело: всё, кроме полосы рамки (`spacer`). Рамку рисует
   * LiquidField, поэтому в тело поля она не входит.
   *
   * Input закрытой зоны = губа + полоса рамки до края экрана. Открытой —
   * только тело. Оба считаются из одного `compute_bounds`.
   */
  measure(relativeTo: Gtk.Widget): WindowMeasure {
    const raw = this.slot.bounds(relativeTo);
    if (!raw) {
      return { body: null, input: null };
    }
    if (!this.hover) {
      return { body: raw, input: raw };
    }

    const body = this.bodyRect(raw);
    const input = this.slot.revealed
      ? body
      : hoverInput(body, this.spec.edge, this.style().border);

    return {
      body: body.w >= 1 && body.h >= 1 ? body : null,
      input,
    };
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
