// Geometry of a cava visualizer: pure numbers, no GTK, so it is testable in
// node. The widget (MCava) only turns these rects into snapshot nodes.
//
// Values arrive at the framerate of the capture (60/s by default) and are the
// hot path, so this allocates one object per visible bar and nothing else.

import type { Rect } from '@lib/geometry';

/** A bar thinner than this is not drawn: at silence it would be a hairline. */
const MIN_BAR_PX = 1;

/**
 * Split `values` into bars across `width` x `height`, growing from the bottom.
 * Values are clamped to 0..1 - cava overshoots that range on loud input.
 * A bar below `minHeight` is drawn at `minHeight` (default 0): a floor of
 * silence instead of an empty row.
 */
export function barRects(
  values: readonly number[],
  width: number,
  height: number,
  gap: number,
  minHeight = 0,
): Rect[] {
  const count = values.length;
  const slot = width / count;

  // No room: an empty array is cheaper than a layout of zero-width bars.
  if (count === 0 || width <= 0 || height <= 0 || slot - gap < MIN_BAR_PX) {
    return [];
  }

  const barWidth = slot - gap;
  // A floor keeps silence visible instead of an empty row; never taller than
  // the stage itself.
  const floor = Math.min(minHeight, height);
  const rects: Rect[] = [];

  for (const [i, value] of values.entries()) {
    // NaN is not a height: Math.min/max would keep it and GTK would get a
    // broken rect. The guard costs one comparison per bar.
    const level = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    const barHeight = Math.max(floor, level * height);

    if (barHeight < MIN_BAR_PX) {
      continue;
    }

    rects.push({
      x: i * slot + gap / 2,
      y: height - barHeight,
      w: barWidth,
      h: barHeight,
    });
  }

  return rects;
}
