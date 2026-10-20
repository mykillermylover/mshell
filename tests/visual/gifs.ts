// node tests/visual/gifs.ts — рисует сценарии в GIF (тесты не запускают).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { render, scenarioList } from '../support/scenarios.ts';

const out = new URL('out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const writePpm = (
  path: string,
  raster: { width: number; height: number; alpha: Uint8Array; scale: number },
  crop: { x: number; y: number; w: number; h: number },
) => {
  const x0 = Math.floor(crop.x * raster.scale);
  const y0 = Math.floor(crop.y * raster.scale);
  const w = Math.min(raster.width - x0, Math.ceil(crop.w * raster.scale));
  const h = Math.min(raster.height - y0, Math.ceil(crop.h * raster.scale));
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = raster.alpha[(y + y0) * raster.width + x + x0];
      const i = (y * w + x) * 3;
      pixels[i] = on ? 236 : 18;
      pixels[i + 1] = on ? 240 : 20;
      pixels[i + 2] = on ? 245 : 26;
    }
  }
  writeFileSync(path, Buffer.concat([header, pixels]));
};

const gif = (name: string, frames: string[], dir: string) => {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '20',
    '-i',
    path.join(dir, 'f-%03d.ppm'),
    '-vf',
    'scale=iw*2:ih*2:flags=neighbor,palettegen',
    path.join(dir, 'palette.png'),
  ]);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '20',
    '-i',
    path.join(dir, 'f-%03d.ppm'),
    '-i',
    path.join(dir, 'palette.png'),
    '-lavfi',
    'scale=iw*2:ih*2:flags=neighbor[x];[x][1:v]paletteuse',
    path.join(out, `${name}.gif`),
  ]);
  console.log(`${name}.gif: ${frames.length} кадров`);
};

for (const scenario of scenarioList()) {
  const dir = path.join(tmpdir(), `goo-${scenario.name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames: string[] = [];
  for (const [i, bodies] of scenario.frames.entries()) {
    const file = path.join(dir, `f-${String(i).padStart(3, '0')}.ppm`);
    writePpm(file, render(bodies), scenario.crop);
    frames.push(file);
  }
  gif(scenario.name, frames, dir);
}
