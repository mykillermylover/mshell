import { DEFAULTS } from '../../src/lib/config/index.ts';
import {
  bridges,
  type BridgeSpec,
  bridgeSpecFor,
  sigmaOf,
} from '../../src/lib/liquid/bridges.ts';
import type { Body, FrameSpec } from '../../src/lib/liquid/geometry.ts';
import { type Raster, renderGoo, type Scene } from './raster.ts';

export const FIELD = { width: 1260, height: 840, border: 4, screenRadius: 10 };
// Эталон — настройки приложения по умолчанию (config.json их не меняет для
// тестов). CPU-модель берёт σ напрямую; sharp и калибровка Gtk-размытия
// проверяются вживую.
export const MELT = {
  meltRadius: DEFAULTS.style.meltRadius,
  reach: DEFAULTS.style.waistReach,
};
export const NOTES = { w: 288, h: 168 };
export const MIXER = { w: 308, h: 158 };
export const WINDOW_RADIUS = 12;

export const frameOf = (field = FIELD): FrameSpec => ({
  w: field.width,
  h: field.height,
  border: field.border,
  screenRadius: field.screenRadius,
});

export const specOf = (field = FIELD): BridgeSpec =>
  bridgeSpecFor(frameOf(field), {
    meltRadius: MELT.meltRadius,
    reach: MELT.reach,
  });

export const body = (
  x: number,
  y: number,
  size: { w: number; h: number },
): Body => ({
  x,
  y,
  w: size.w,
  h: size.h,
  cornerRadius: WINDOW_RADIUS,
});

export interface RenderOptions {
  scale?: number;
  withoutBridges?: boolean;
  field?: typeof FIELD;
}

export const render = (bodies: Body[], opts: RenderOptions = {}): Raster => {
  const field = opts.field ?? FIELD;
  const scene: Scene = {
    ...field,
    bodies,
    bridges: opts.withoutBridges ? [] : bridges(bodies, specOf(field)),
  };
  return renderGoo(scene, {
    sigma: sigmaOf(MELT.meltRadius),
    scale: opts.scale,
  });
};

export interface Scenario {
  name: string;
  /** Область для GIF, логические px. */
  crop: { x: number; y: number; w: number; h: number };
  frames: Body[][];
}

/** Диагональ: B смещается к A по диагонали шагом 1 px и возвращается. */
const diagonal = (): Body[][] => {
  const a = body(200, 200, NOTES);
  const frames: Body[][] = [];
  for (let d = 30; d >= -20; d--) {
    frames.push([a, body(488 + d, 368 + d, MIXER)]);
  }
  for (let d = -20; d <= 30; d++) {
    frames.push([a, body(488 + d, 368 + d, MIXER)]);
  }
  return frames;
};

/**
 * Ниша: A приклеено к стене, B едет вдоль A к той же стене.
 * Параметр g — зазор B до внутренней кромки, 60 → 0 шагом 2.
 */
const nook = (wall: 'top' | 'bottom' | 'left' | 'right'): Body[][] => {
  const frames: Body[][] = [];
  for (let g = 60; g >= 0; g -= 2) {
    const b = { w: MIXER.w, h: MIXER.h };
    switch (wall) {
      case 'top': {
        frames.push([body(400, 4, NOTES), body(718, 4 + g, b)]);
        break;
      }
      case 'bottom': {
        frames.push([body(400, 668, NOTES), body(718, 836 - MIXER.h - g, b)]);
        break;
      }
      case 'left': {
        frames.push([body(4, 300, NOTES), body(4 + g, 498, b)]);
        break;
      }
      case 'right': {
        frames.push([body(968, 300, NOTES), body(1256 - MIXER.w - g, 498, b)]);
        break;
      }
    }
  }
  return frames;
};

/** Угол: окно едет по диагонали к левому верхнему углу, 60 → 0 шагом 4. */
const corner = (): Body[][] => {
  const frames: Body[][] = [];
  for (let d = 60; d >= 0; d -= 4) {
    frames.push([body(FIELD.border + d, FIELD.border + d, NOTES)]);
  }
  return frames;
};

/** Снап: easeOutBack-перелёт от свободной точки к верхней стене. */
const easeOutBack = (t: number) => {
  const c1 = 1.701_58;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

const snap = (): Body[][] => {
  const from = { x: 500, y: 260 };
  const to = { x: 500, y: FIELD.border };
  const frames: Body[][] = [];
  for (let i = 0; i <= 30; i++) {
    const k = easeOutBack(i / 30);
    frames.push([body(from.x, from.y + (to.y - from.y) * k, NOTES)]);
  }
  return frames;
};

export const scenarioList = (): Scenario[] => [
  {
    name: 'diagonal',
    crop: { x: 180, y: 180, w: 560, h: 420 },
    frames: diagonal(),
  },
  {
    name: 'nook-top',
    crop: { x: 380, y: 0, w: 660, h: 260 },
    frames: nook('top'),
  },
  {
    name: 'nook-bottom',
    crop: { x: 380, y: 580, w: 660, h: 260 },
    frames: nook('bottom'),
  },
  {
    name: 'nook-left',
    crop: { x: 0, y: 280, w: 620, h: 400 },
    frames: nook('left'),
  },
  {
    name: 'nook-right',
    crop: { x: 640, y: 280, w: 620, h: 400 },
    frames: nook('right'),
  },
  { name: 'corner', crop: { x: 0, y: 0, w: 380, h: 320 }, frames: corner() },
  { name: 'snap', crop: { x: 380, y: 0, w: 560, h: 300 }, frames: snap() },
];
