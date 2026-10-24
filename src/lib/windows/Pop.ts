import type { FieldStyle } from '@lib/config';
import type { Rect } from '@lib/geometry';
import { noop } from '@lib/utils';
import type { Gtk } from 'ags/gtk4';

import {
  asWidget,
  createWindowContent,
  type HoverSpec,
  isVerticalEdge,
  type PopSpec,
  type WindowHost,
} from './api';
import { popLayout } from './popLayout';
import { buildPopRevealer, buildPopSlot, type PopSlot } from './popSlot';
import { Window, type WindowMeasure } from './window';

/**
 * Слот рамки: геометрия тела и правила hover. GTK-виджеты и подписки -
 * в popSlot.ts; контроллер движения - один на Frame; открытость, pin
 * и api - в Window.
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
    // measure виджета рекурсивно измеряет детей (Revealer, контент).
    this.widget.get_preferred_size();
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

  /**
   * Видимое тело: всё, кроме полосы рамки (`spacer`). Рамку рисует
   * LiquidField, поэтому в тело поля она не входит.
   *
   * Input закрытой зоны = губа + полоса рамки до края экрана. Открытой -
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
    // Закрытая зона ловит сырые границы слота: тело плюс полоса рамки до
    // края экрана. Что видно (губа) - то и ловится.
    const input = this.slot.revealed ? body : raw;

    return {
      body: body.w >= 1 && body.h >= 1 ? body : null,
      input,
    };
  }

  /** Применить длительности и раскладку по текущему конфигу. */
  apply() {
    const style = this.style();
    this.slot.apply(style.revealDuration, this.layout(style));
  }

  protected watchedRevealers(): Gtk.Revealer[] {
    const zone = this.slot.zoneRevealer;
    return zone ? [this.revealer, zone] : [this.revealer];
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
    // Нижняя граница уже отсечена конфигом (LIMITS.style.hoverDepth >= 1).
    return style.hoverDepth;
  }

  /** Раскладка по текущему конфигу. */
  private layout(style = this.style()) {
    const offset = isVerticalEdge(this.spec)
      ? (this.spec.offsetY ?? 0)
      : (this.spec.offsetX ?? 0);

    return popLayout(
      this.spec.edge,
      this.spec.align ?? 'center',
      { border: style.border, screenRadius: style.screenRadius },
      this.depth(style),
      Boolean(this.hover),
      offset,
    );
  }
}
