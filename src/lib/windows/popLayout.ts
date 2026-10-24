// Чистая раскладка попапа: прижатие Box к кромке рамки, align вдоль края,
// порядок детей (spacer у рамки, Revealer, зона на дальней кромке) и толщина.
// Без GJS - тестируется в node.

export type HorizontalEdge = 'top' | 'bottom';
export type VerticalEdge = 'left' | 'right';
export type Edge = HorizontalEdge | VerticalEdge;
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
  /** Порядок детей Box от его начала; spacer - только у hover-попапа. */
  children: Array<'spacer' | 'revealer' | 'zone'>;
  spacer: { widthRequest: number; heightRequest: number };
  zone: { widthRequest: number; heightRequest: number };
}

/** GTK: -1 - размер по содержимому, а не запрошенный. */
const NATURAL_SIZE = -1;

type Margins = Record<
  'marginStart' | 'marginEnd' | 'marginTop' | 'marginBottom',
  number
>;

/**
 * Сдвиг вдоль края: `distance` > 0 — вправо (верх/низ) или вниз (лево/право).
 * Марджины GTK неотрицательны, поэтому движение «наружу» от угла упирается
 * в кромку: итоговое отклонение насыщается, а не отбрасывается.
 */
const shiftAlong = (
  margins: Margins,
  start: 'marginStart' | 'marginTop',
  end: 'marginEnd' | 'marginBottom',
  align: EdgeAlign,
  distance: number,
): void => {
  if (align === 'center') {
    // Центр сдвигается на (marginStart - marginEnd) / 2.
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
 * Вдоль края - align; для start/end добавляется отступ от угла
 * border + screenRadius. Поперёк - прижатие к кромке рамки.
 *
 * Без hover frame-side отступ - это margin Box'а: overlay не читает его для
 * позиции, а content box сжимается на величину margin. С hover отступ
 * становится реальным spacer'ом внутри Box: зона не теряет толщину. В тело
 * поля spacer не входит (рамку рисует LiquidField), а input закрытой зоны
 * достраивается на него до края экрана.
 */
export function popLayout(
  edge: Edge,
  align: EdgeAlign,
  style: LayoutStyle,
  depth: number,
  hover: boolean,
  offset = 0,
): PopLayout {
  const corner = style.border + style.screenRadius;
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
      margins.marginStart = corner;
    }
    if (align === 'end') {
      margins.marginEnd = corner;
    }
  } else {
    if (align === 'start') {
      margins.marginTop = corner;
    }
    if (align === 'end') {
      margins.marginBottom = corner;
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

  const zone = horizontal
    ? { widthRequest: NATURAL_SIZE, heightRequest: depth }
    : { widthRequest: depth, heightRequest: NATURAL_SIZE };

  return {
    orientation: horizontal ? 'vertical' : 'horizontal',
    anchor,
    children,
    spacer,
    zone,
  };
}
