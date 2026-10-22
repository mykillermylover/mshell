// CPU-модель слоя жидкости: те же тела и капсулы, box-blur ≈ Gaussian, порог 0.5.
// Это модель алгоритма, а не пиксельная копия GPU: проверяем топологию и
// непрерывность, а не цвет и сглаживание краёв.
import type { Bridge } from '../../src/lib/liquid/bridges';
import type { Body } from '../../src/lib/liquid/geometry';

export interface Scene {
  width: number;
  height: number;
  border: number;
  screenRadius: number;
  bodies: Body[];
  bridges: Bridge[];
}

export interface Raster {
  width: number;
  height: number;
  /** Уже с порогом: 1 — жидкость. */
  alpha: Uint8Array;
  /** Материал до размытия (полосы, тела, мостики). */
  material: Uint8Array;
  scale: number;
}

/** Расстояние до скруглённого прямоугольника (SDF), ≤ 0 — внутри. */
const roundedSdf = (
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
};

/**
 * Мостик: тот же скруглённый прямоугольник, что рисует Gsk, — повёрнутый на
 * angle вокруг центра, радиус min(length, width)/2. Крутим точку в систему
 * мостика, поэтому формула та же, что у тел.
 */
const bridgeSdf = (
  px: number,
  py: number,
  b: {
    centerX: number;
    centerY: number;
    length: number;
    width: number;
    angle: number;
  },
) => {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  const dx = px - b.centerX;
  const dy = py - b.centerY;
  return roundedSdf(
    dx * cos + dy * sin,
    -dx * sin + dy * cos,
    -b.length / 2,
    -b.width / 2,
    b.length,
    b.width,
    Math.min(b.length, b.width) / 2,
  );
};

/** Радиус одной box-свёртки под суммарную σ при трёх проходах. */
const boxRadius = (sigma: number) =>
  Math.max(1, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2));

const boxPass = (
  input: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
) => {
  const out = new Float32Array(input.length);
  const len = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const at = horizontal
    ? (line: number, i: number) => line * w + i
    : (line: number, i: number) => i * w + line;
  for (let line = 0; line < outer; line++) {
    let sum = 0;
    for (let i = 0; i <= Math.min(r, len - 1); i++) {
      sum += input[at(line, i)];
    }
    for (let i = 0; i < len; i++) {
      out[at(line, i)] = sum / (2 * r + 1);
      if (i + r + 1 < len) {
        sum += input[at(line, i + r + 1)];
      }
      if (i - r >= 0) {
        sum -= input[at(line, i - r)];
      }
    }
  }
  return out;
};

/** Blur с прозрачностью за краем (как Gsk: вне узла альфа 0). */
const blur = (src: Float32Array, w: number, h: number, sigma: number) => {
  const r = boxRadius(sigma);
  let cur = src;
  for (let i = 0; i < 3; i++) {
    cur = boxPass(cur, w, h, r, true);
    cur = boxPass(cur, w, h, r, false);
  }
  return cur;
};

// σ — собственно гауссова сигма в логических px. У GTK `push_blur` аргумент
// — «радиус» ≈ 3.2σ (LiquidField умножает σ на внутреннюю константу GTK);
// CPU-модель принимает σ напрямую, иначе blur в модели был бы в 3.2 раза шире.
export const renderGoo = (
  scene: Scene,
  opts: { sigma: number; scale?: number },
): Raster => {
  const scale = opts.scale ?? 0.5;
  const width = Math.ceil(scene.width * scale);
  const height = Math.ceil(scene.height * scale);
  // Поля вокруг экрана, как в LiquidField: рамка уходит за край, чтобы blur не
  // съел полосу с наружной стороны. В результат поля не входят.
  const sigmaPx = opts.sigma * scale;
  const pad = Math.ceil(sigmaPx * 5) + 8;
  const cw = width + 2 * pad;
  const ch = height + 2 * pad;
  const canvas = new Uint8Array(cw * ch);
  const px = (v: number) => v * scale;

  /** Залить логические координаты по предикату (предикат тоже в логике). */
  const mark = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    test: (x: number, y: number) => boolean,
  ) => {
    const xs = Math.max(0, Math.floor(px(x0) + pad));
    const xe = Math.min(cw - 1, Math.ceil(px(x1) + pad));
    const ys = Math.max(0, Math.floor(px(y0) + pad));
    const ye = Math.min(ch - 1, Math.ceil(px(y1) + pad));
    for (let y = ys; y <= ye; y++) {
      for (let x = xs; x <= xe; x++) {
        if (test((x + 0.5 - pad) / scale, (y + 0.5 - pad) / scale)) {
          canvas[y * cw + x] = 1;
        }
      }
    }
  };

  // Рамка в слое жидкости — то же кольцо, что рисует чёткая рамка
  // (append_border): материал идёт по всей кромке, включая дуги углов.
  // Наружу уходит за экран, как в LiquidField, чтобы blur не съел внешний край.
  const band = Math.ceil(opts.sigma * 5) + 16;
  mark(-band, -band, scene.width + band, scene.height + band, (x, y) => {
    const outer = roundedSdf(
      x,
      y,
      -band,
      -band,
      scene.width + 2 * band,
      scene.height + 2 * band,
      scene.screenRadius + scene.border + band,
    );
    const inner = roundedSdf(
      x,
      y,
      scene.border,
      scene.border,
      scene.width - 2 * scene.border,
      scene.height - 2 * scene.border,
      scene.screenRadius,
    );
    return outer <= 0 && inner > 0;
  });

  for (const b of scene.bodies) {
    mark(
      b.x,
      b.y,
      b.x + b.w,
      b.y + b.h,
      (x, y) => roundedSdf(x, y, b.x, b.y, b.w, b.h, b.cornerRadius) <= 0,
    );
  }

  for (const b of scene.bridges) {
    // AABB повёрнутого прямоугольника мостика.
    const hx =
      Math.abs(Math.cos(b.angle)) * (b.length / 2) +
      Math.abs(Math.sin(b.angle)) * (b.width / 2);
    const hy =
      Math.abs(Math.sin(b.angle)) * (b.length / 2) +
      Math.abs(Math.cos(b.angle)) * (b.width / 2);
    mark(
      b.centerX - hx,
      b.centerY - hy,
      b.centerX + hx,
      b.centerY + hy,
      (x, y) => bridgeSdf(x, y, b) <= 0,
    );
  }

  const blurred = blur(Float32Array.from(canvas), cw, ch, sigmaPx);
  const alpha = new Uint8Array(width * height);
  const material = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y + pad) * cw + (x + pad);
      alpha[y * width + x] = blurred[src] > 0.5 ? 1 : 0;
      material[y * width + x] = canvas[src];
    }
  }
  return { width, height, alpha, material, scale };
};

/** Есть ли путь по жидкости от логической точки from до любой точки target. */
export const reaches = (
  raster: Raster,
  from: { x: number; y: number },
  target: (x: number, y: number) => boolean,
): boolean => {
  const sx = Math.min(
    raster.width - 1,
    Math.max(0, Math.floor(from.x * raster.scale)),
  );
  const sy = Math.min(
    raster.height - 1,
    Math.max(0, Math.floor(from.y * raster.scale)),
  );
  const start = sy * raster.width + sx;
  if (!raster.alpha[start]) {
    return false;
  }
  const seen = new Uint8Array(raster.alpha.length);
  const queue: number[] = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const at = queue.pop()!;
    const x = at % raster.width;
    const y = (at - x) / raster.width;
    if (target((x + 0.5) / raster.scale, (y + 0.5) / raster.scale)) {
      return true;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) {
        continue;
      }
      const ni = ny * raster.width + nx;
      if (!seen[ni] && raster.alpha[ni]) {
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return false;
};

/** Площадь жидкости, которой нет в материале: добавка от blur и мостиков. */
export const addedArea = (raster: Raster) => {
  let count = 0;
  for (let i = 0; i < raster.alpha.length; i++) {
    if (raster.alpha[i] && !raster.material[i]) {
      count++;
    }
  }
  return count;
};

/**
 * Жидкость в комнате у углов экрана. Квадрат [border + r, border + 3r]² от угла —
 * это уже комната за кольцом обводки (внутреннее скругление r, далее кольцо
 * шириной border). Без окон там должно быть пусто: иначе хвост blur затекает
 * из вогнутого угла рамки — именно так выглядел старый «уголок» жидкости.
 */
export const cornerRoomDirty = (
  raster: Raster,
  field: {
    width: number;
    height: number;
    border: number;
    screenRadius: number;
  },
): string[] => {
  const r = field.screenRadius;
  const b = field.border;
  const size = 2 * r;
  const corners = [
    { name: 'ЛВ', x: b + r, y: b + r },
    { name: 'ПВ', x: field.width - b - 3 * r, y: b + r },
    { name: 'ЛН', x: b + r, y: field.height - b - 3 * r },
    { name: 'ПН', x: field.width - b - 3 * r, y: field.height - b - 3 * r },
  ];
  const dirty: string[] = [];
  for (const c of corners) {
    const xs = Math.floor(c.x * raster.scale);
    const ys = Math.floor(c.y * raster.scale);
    const span = Math.ceil(size * raster.scale);
    let bad = 0;
    for (let y = ys; y < Math.min(raster.height, ys + span); y++) {
      for (let x = xs; x < Math.min(raster.width, xs + span); x++) {
        if (raster.alpha[y * raster.width + x]) {
          bad++;
        }
      }
    }
    if (bad > 0) {
      dirty.push(`${c.name}: ${bad}`);
    }
  }
  return dirty;
};
