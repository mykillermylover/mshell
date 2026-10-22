import { type Bridge, bridges, bridgeSpecFor } from './bridges';
import {
  type Body,
  type Box,
  clampRadius,
  type FrameSpec,
} from './geometry';

export interface SceneStyle {
  windowRadius: number;
  meltRadius: number;
  waistReach: number;
}

export interface LiquidScene {
  bodies: Body[];
  bridges: Bridge[];
}

/** Сцена жидкости: тела с зажатым радиусом и мостики между ними. */
export const buildScene = (
  rects: Box[],
  frame: FrameSpec,
  style: SceneStyle,
): LiquidScene => {
  const bodies = rects.map((rect) => {
    const body = { ...rect, cornerRadius: style.windowRadius };
    return { ...body, cornerRadius: clampRadius(body) };
  });

  return {
    bodies,
    bridges: bridges(
      bodies,
      bridgeSpecFor(frame, {
        meltRadius: style.meltRadius,
        reach: style.waistReach,
      }),
    ),
  };
};
