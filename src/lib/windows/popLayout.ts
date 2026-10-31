// Pure popover layout: pinning the Box to the frame edge, align along the edge,
// child order (spacer at the frame, Revealer, zone at the far edge) and thickness.
// Without GJS - tested in node.

import type { Rect } from '@lib/geometry';

export type HorizontalEdge = 'top' | 'bottom';
export type VerticalEdge = 'left' | 'right';
export type Edge = HorizontalEdge | VerticalEdge;
export type EdgeAlign = 'start' | 'center' | 'end' | 'fill';

export interface LayoutStyle {
  border: number;
}

export interface PopLayout {
  orientation: 'vertical' | 'horizontal';
  anchor: {
    halign: EdgeAlign;
    valign: EdgeAlign;
    marginStart: number;
    marginEnd: number;
    marginTop: number;
    marginBottom: number;
  };
  /** Box child order from its start; spacer - only in a hover popover. */
  children: Array<'spacer' | 'revealer' | 'zone'>;
  spacer: { widthRequest: number; heightRequest: number };
  zone: { widthRequest: number; heightRequest: number };
}

/** GTK: -1 - size by content, not the requested one. */
const NATURAL_SIZE = -1;

type Margins = Record<
  'marginStart' | 'marginEnd' | 'marginTop' | 'marginBottom',
  number
>;

/**
 * Shift along the edge: `distance` > 0 - right (top/bottom) or down (left/right).
 * GTK margins are non-negative, so movement "outward" from the corner hits
 * the edge: the resulting offset saturates instead of being discarded.
 */
const shiftAlong = (
  margins: Margins,
  start: 'marginStart' | 'marginTop',
  end: 'marginEnd' | 'marginBottom',
  align: EdgeAlign,
  distance: number,
): void => {
  if (align === 'fill') {
    // A filled box spans the whole edge: there is nothing to shift it from.
    return;
  }

  if (align === 'center') {
    // The center shifts by (marginStart - marginEnd) / 2.
    if (distance > 0) {
      margins[start] += 2 * distance;
    } else {
      margins[end] += -2 * distance;
    }
    return;
  }

  if (align === 'start') {
    margins[start] = Math.max(0, margins[start] + distance);
  } else {
    margins[end] = Math.max(0, margins[end] - distance);
  }
};

/**
 * Along the edge - align (start/end sit flush with the frame corner, fill spans
 * the edge). Across it - pinning to the frame edge; `fill` is only meaningful
 * across the other axis.
 *
 * `depth` is the lip thickness of a hover zone without its own content.
 * `null` - size the zone by that content, so a small widget is not clipped
 * to a minimum it never asked for.
 *
 * Without hover, the frame-side offset is the Box margin: the overlay does not read it for
 * the position, and the content box shrinks by the margin. With hover, the offset
 * becomes a real spacer inside the Box: the zone does not lose thickness. The spacer
 * is not part of the field body (the frame is drawn by LiquidField), and the closed zone input
 * is extended over it up to the screen edge.
 */
export function popLayout(
  edge: Edge,
  align: EdgeAlign,
  style: LayoutStyle,
  depth: number | null,
  hover: boolean,
  offset = 0,
): PopLayout {
  const horizontal = edge === 'top' || edge === 'bottom';

  const margins = {
    marginStart: 0,
    marginEnd: 0,
    marginTop: 0,
    marginBottom: 0,
  };

  if (!hover) {
    switch (edge) {
      case 'top': {
        margins.marginTop = style.border;
        break;
      }
      case 'bottom': {
        margins.marginBottom = style.border;
        break;
      }
      case 'left': {
        margins.marginStart = style.border;
        break;
      }
      default: {
        margins.marginEnd = style.border;
      }
    }
  }

  if (offset !== 0) {
    if (horizontal) {
      shiftAlong(margins, 'marginStart', 'marginEnd', align, offset);
    } else {
      shiftAlong(margins, 'marginTop', 'marginBottom', align, offset);
    }
  }

  const anchor = horizontal
    ? {
        halign: align,
        valign: edge === 'top' ? ('start' as const) : ('end' as const),
        ...margins,
      }
    : {
        halign: edge === 'left' ? ('start' as const) : ('end' as const),
        valign: align,
        ...margins,
      };

  const frameFirst = edge === 'top' || edge === 'left';
  const children: PopLayout['children'] = [];

  if (frameFirst) {
    if (hover) {
      children.push('spacer');
    }
    children.push('revealer', 'zone');
  } else {
    children.push('zone', 'revealer');
    if (hover) {
      children.push('spacer');
    }
  }

  const spacer = horizontal
    ? { widthRequest: NATURAL_SIZE, heightRequest: hover ? style.border : 0 }
    : { widthRequest: hover ? style.border : 0, heightRequest: NATURAL_SIZE };

  const lip = depth ?? NATURAL_SIZE;
  const zone = horizontal
    ? { widthRequest: NATURAL_SIZE, heightRequest: lip }
    : { widthRequest: lip, heightRequest: NATURAL_SIZE };

  return {
    orientation: horizontal ? 'vertical' : 'horizontal',
    anchor,
    children,
    spacer,
    zone,
  };
}

/**
 * Visible body: the slot without the frame strip. The strip is frame material drawn
 * by LiquidField, so it is not a body.
 */
export function popBody(rect: Rect, edge: Edge, border: number): Rect {
  switch (edge) {
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
