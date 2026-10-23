// Debug-команды для живых прогонов. Включаются только при MSHELL_DEBUG=1:
// в продакшене остаются toggle/open/close/closeall.
import { Gtk } from 'ags/gtk4';

import { snapshot } from './config';
import { config } from './config/app';
import type { Frame } from './frame/Frame';

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

let spawnSeq = 0;

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
    case 'inputs': {
      return JSON.stringify(frame.debug.inputs());
    }
    case 'region': {
      return frame.debug.region() ?? 'none';
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
    case 'hover': {
      const pop = id ? frame.debug.pop(id) : undefined;
      if (!pop) {
        return 'bad hover';
      }

      if (args[2] === 'off') {
        pop.leave();
      } else {
        pop.enter();
      }
      return 'ok';
    }
    case 'pin': {
      const pop = id ? frame.debug.pop(id) : undefined;
      if (!pop) {
        return 'bad pin';
      }

      pop.pin();
      return 'ok';
    }
    case 'unpin': {
      const pop = id ? frame.debug.pop(id) : undefined;
      if (!pop) {
        return 'bad unpin';
      }

      pop.unpin();
      return 'ok';
    }
    case 'spawn': {
      const count = numberArg(args[1]);
      if (count === null || count < 1) {
        return 'bad spawn';
      }

      for (let i = 0; i < count; i++) {
        const index = spawnSeq++;
        frame.addFloat({
          id: `bench-${index}`,
          title: `Bench ${index}`,
          x: 100 + (index % 5) * 180,
          y: 100 + Math.floor(index / 5) * 120,
          content: () =>
            new Gtk.Label({
              label: `bench ${index}`,
            }) as unknown as JSX.Element,
        });
      }

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
      const applied = (snapshot(config.style) as Record<string, number>)[key];
      return `${key} = ${applied}`;
    }
    default: {
      return undefined;
    }
  }
}
