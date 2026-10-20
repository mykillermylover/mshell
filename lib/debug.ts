// Debug-команды для живых прогонов. Включаются только при MSHELL_DEBUG=1:
// в продакшене остаются toggle/open/close/closeall.
import { config } from './config-app';
import type { Frame } from './Frame';

const has = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);

// Параметры debug-замера нагрузки: проход 200 px за 3 с.
const BENCH_MARGIN = 250;
const BENCH_TRAVEL = 200;
const BENCH_MS = 3000;

const numberArg = (value: string | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function handleDebug(frame: Frame, args: string[]): string | undefined {
  const [cmd, id] = args;

  switch (cmd) {
    case 'place': {
      const float = frame.debug.float(id);
      const gap = numberArg(args[3]);
      if (!float || gap === null) {
        return 'bad place';
      }

      const { w, h } = frame.debug.size();
      const [windowWidth, windowHeight] = float.natural();
      const border = frame.debug.border();
      const centerX = (w - windowWidth) / 2;
      const centerY = (h - windowHeight) / 2;
      const positions: Record<string, [number, number]> = {
        top: [centerX, border + gap],
        bottom: [centerX, h - border - gap - windowHeight],
        left: [border + gap, centerY],
        right: [w - border - gap - windowWidth, centerY],
        tl: [border + gap, border + gap],
        tr: [w - border - gap - windowWidth, border + gap],
        bl: [border + gap, h - border - gap - windowHeight],
        br: [w - border - gap - windowWidth, h - border - gap - windowHeight],
        center: [centerX, centerY],
      };
      const where = args[2];
      if (!has(positions, where)) {
        return 'bad place';
      }

      frame.debug.reveal(float);
      frame.debug.move(float, ...positions[where]);
      return 'ok';
    }
    case 'at': {
      const float = frame.debug.float(id);
      const x = numberArg(args[2]);
      const y = numberArg(args[3]);
      if (!float || x === null || y === null) {
        return 'bad at';
      }

      frame.debug.reveal(float);
      frame.debug.move(float, x, y);
      return 'ok';
    }
    case 'pair': {
      const first = frame.debug.float(id);
      const second = frame.debug.float(args[2]);
      const gap = numberArg(args[3]);
      if (!first || !second || gap === null) {
        return 'bad pair';
      }

      const { w, h } = frame.debug.size();
      const [firstWidth, firstHeight] = first.natural();
      const [, secondHeight] = second.natural();
      frame.debug.reveal(first);
      frame.debug.reveal(second);
      frame.debug.move(
        first,
        w / 2 - gap / 2 - firstWidth,
        (h - firstHeight) / 2,
      );
      frame.debug.move(second, w / 2 + gap / 2, (h - secondHeight) / 2);
      return 'ok';
    }
    case 'rects': {
      return JSON.stringify(frame.debug.rects());
    }
    case 'bench': {
      const float = frame.debug.float(id);
      if (!float) {
        return 'bad bench';
      }

      const { w } = frame.debug.size();
      const fromX = Math.min(
        float.x,
        w - float.revealer.get_width() - BENCH_MARGIN,
      );
      frame.debug.tween(
        float,
        fromX,
        float.y,
        fromX + BENCH_TRAVEL,
        float.y,
        BENCH_MS,
      );
      return 'ok';
    }
    case 'snap': {
      const float = frame.debug.float(id);
      if (!float) {
        return 'bad snap';
      }

      frame.debug.snap(float);
      return 'ok';
    }
    case 'frames': {
      return String(frame.frames);
    }
    case 'tune': {
      const key = args[1];
      const value = numberArg(args[2]);
      if (!key || value === null || !has(config.style, key)) {
        return 'bad tune';
      }

      config.update('style', { [key]: value });
      return `${key} = ${value}`;
    }
    default: {
      return undefined;
    }
  }
}
