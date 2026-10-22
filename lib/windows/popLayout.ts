// Чистая раскладка попапа: прижатие Box к кромке рамки, align вдоль края,
// порядок детей (spacer у рамки, Revealer, зона на дальней кромке) и толщина.
// Без GJS — тестируется в node.
import type { Rect } from '../liquid/LiquidField';

export type Edge = 'top' | 'bottom' | 'left' | 'right';
export type EdgeAlign = 'start' | 'center' | 'end';

export interface LayoutStyle {
  border: number;
  screenRadius: number;
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
  /** Порядок детей Box от его начала; spacer — только у hover-попапа. */
  children: Array<'spacer' | 'revealer' | 'zone'>;
  spacer: { widthRequest: number; heightRequest: number };
  zone: { widthRequest: number; heightRequest: number };
}

/**
 * Вдоль края — align; для start/end добавляется отступ от угла
 * border + screenRadius. Поперёк — прижатие к кромке рамки.
 *
 * Без hover frame-side отступ — это margin Box'а: overlay не читает его для
 * позиции, а content box сжимается на величину margin. С hover отступ
 * становится реальным spacer'ом внутри Box: зона не теряет толщину. В тело
 * поля spacer не входит (рамку рисует LiquidField), а input закрытой зоны
 * достраивается на него до края экрана.
 */
export const popLayout = (
  edge: Edge,
  align: EdgeAlign,
  style: LayoutStyle,
  depth: number,
  hover: boolean,
): PopLayout => {
  const offset = style.border + style.screenRadius;
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

  if (horizontal) {
    if (align === 'start') {
      margins.marginStart = offset;
    }
    if (align === 'end') {
      margins.marginEnd = offset;
    }
  } else {
    if (align === 'start') {
      margins.marginTop = offset;
    }
    if (align === 'end') {
      margins.marginBottom = offset;
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
    ? { widthRequest: -1, heightRequest: hover ? style.border : 0 }
    : { widthRequest: hover ? style.border : 0, heightRequest: -1 };

  const zone = horizontal
    ? { widthRequest: -1, heightRequest: depth }
    : { widthRequest: depth, heightRequest: -1 };

  return {
    orientation: horizontal ? 'vertical' : 'horizontal',
    anchor,
    children,
    spacer,
    zone,
  };
};

/**
 * Input закрытой hover-зоны: тело плюс полоса рамки до края экрана.
 * Никакого вывода из рендера: что видно (губа), то и ловится.
 */
export const hoverInput = (body: Rect, edge: Edge, border: number): Rect => {
  switch (edge) {
    case 'top': {
      return { ...body, y: body.y - border, h: body.h + border };
    }
    case 'bottom': {
      return { ...body, h: body.h + border };
    }
    case 'left': {
      return { ...body, x: body.x - border, w: body.w + border };
    }
    default: {
      return { ...body, w: body.w + border };
    }
  }
};
