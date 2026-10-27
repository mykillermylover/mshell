import type { FieldStyle } from '@lib/config';
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
import { popBody, popLayout } from './popLayout';
import { buildPopRevealer, buildPopSlot, type PopSlot } from './popSlot';
import { Window, type WindowMeasure } from './window';

/**
 * Frame slot: body geometry and hover rules. GTK widgets and subscriptions -
 * in popSlot.ts; the motion controller is one per Frame; open state, pin
 * and api - in Window.
 */
export class Pop extends Window {
  readonly widget: Gtk.Box;
  private readonly slot: PopSlot;
  private readonly hover: HoverSpec | null;
  private readonly disposeHover: () => void;

  constructor(
    readonly spec: PopSpec,
    private style: () => FieldStyle,
    onActivate: () => void,
    host: WindowHost,
  ) {
    const hoverSpec = spec.hover === true ? {} : (spec.hover ?? null);
    const revealer = buildPopRevealer(spec.edge, spec.openByDefault);
    super({
      id: spec.id,
      content: spec.content,
      revealer,
      exclusive: spec.exclusive ?? true,
      host,
      activate: onActivate,
      keyboard: spec.keyboard,
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

  /** Prewarm the preferred size after map: the first hover does not pay for layout. */
  prewarm() {
    // The widget measure recursively measures children (Revealer, content).
    this.widget.get_preferred_size();
  }

  dispose() {
    this.slot.cleanup();
    this.disposeHover();
    super.dispose();
  }

  /** Hover is needed both for the hover zone and for a window with input. */
  protected override get acceptsHover(): boolean {
    return this.hover !== null || this.keyboard;
  }

  /**
   * Visible body: everything except the frame strip (`spacer`). The frame is drawn
   * by LiquidField, so it is not part of the field body.
   *
   * Input is the raw slot bounds: lip plus the frame strip up to the screen edge,
   * open or closed. It deliberately does not depend on the open state: a strip left
   * under the resting cursor would otherwise close the popover right after the
   * reveal and catch it again - an endless cycle.
   */
  measure(relativeTo: Gtk.Widget): WindowMeasure {
    const raw = this.slot.bounds(relativeTo);
    if (!raw) {
      return { body: null, input: null };
    }
    if (!this.hover) {
      return { body: raw, input: raw };
    }

    const body = popBody(raw, this.spec.edge, this.style().border);

    return {
      body: body.w >= 1 && body.h >= 1 ? body : null,
      input: raw,
    };
  }

  /** Apply durations and layout from the current config. */
  apply() {
    const style = this.style();
    this.slot.apply(style.revealDuration, this.layout(style));
  }

  protected watchedRevealers(): Gtk.Revealer[] {
    const zone = this.slot.zoneRevealer;
    return zone ? [this.revealer, zone] : [this.revealer];
  }

  /** Lip thickness from the current config. */
  private depth(style = this.style()) {
    if (!this.hover) {
      return 0;
    }
    // The lower bound is already clamped by the config (LIMITS.style.hoverDepth >= 1).
    return style.hoverDepth;
  }

  /** Layout from the current config. */
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
