// Геометрия жидкости: тела — скруглённые прямоугольники, кромка рамки — прямые
// участки стен и дуги внутренних углов. Здесь только поиск ближайших точек,
// глобальных «якорей» и состояния нет.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body extends Box {
  /** Радиус скругления углов тела (для окон — `windowRadius`). */
  cornerRadius: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Точки контакта: a — на первом теле, b — на втором; nx, ny — нормаль a→b. */
export interface Contact {
  a: Point;
  b: Point;
  gap: number;
  /** Длина общего участка прямых сторон (0 — стык уголками/дугой). */
  seam: number;
  nx: number;
  ny: number;
}

/** Внутренняя кромка рамки: прямоугольник с отступом border и радиусом дуг. */
export interface FrameSpec {
  w: number;
  h: number;
  border: number;
  screenRadius: number;
}

/** Радиус, который реально влезает в тело (углы не больше половины стороны). */
export const clampRadius = (body: Body) =>
  Math.max(0, Math.min(body.cornerRadius, body.w / 2, body.h / 2));

/**
 * Сердцевина: скруглённый прямоугольник = прямоугольник ⊕ круг радиуса R
 * (сумма Минковского). Поэтому все расстояния считаем между сердцевинами
 * и вычитаем R1 + R2.
 */
export const coreOf = (body: Body): Box => {
  const r = clampRadius(body);
  return { x: body.x + r, y: body.y + r, w: body.w - 2 * r, h: body.h - 2 * r };
};

/**
 * Зазор между двумя отрезками одной оси и точки, между которыми он меряется.
 *
 * Если отрезки не пересекаются — ближайшие концы. Если пересекаются — берём
 * СЕРЕДИНУ общего участка: она рождается в точке касания и дальше едет
 * непрерывно. Иначе на переходе «диагональ → ребро» точка прыгала бы с угла
 * на середину стороны.
 */
const axisGap = (a0: number, a1: number, b0: number, b1: number) => {
  if (b0 > a1) {
    return { from: a1, to: b0, gap: b0 - a1 };
  }
  if (a0 > b1) {
    return { from: a0, to: b1, gap: a0 - b1 };
  }
  const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  return { from: mid, to: mid, gap: 0 };
};

/** Ближайшие точки двух тел; null — сердцевины перекрылись (тела уже слиты). */
export const contactBetween = (first: Body, second: Body): Contact | null => {
  const r1 = clampRadius(first);
  const r2 = clampRadius(second);
  const c1 = coreOf(first);
  const c2 = coreOf(second);
  const x = axisGap(c1.x, c1.x + c1.w, c2.x, c2.x + c2.w);
  const y = axisGap(c1.y, c1.y + c1.h, c2.y, c2.y + c2.h);
  const dx = x.to - x.from;
  const dy = y.to - y.from;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    return null;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  // Стык — пересечение ПРЯМЫХ участков сторон (то есть сердцевин): скругления
  // углов в стыкующееся ребро не входят. В момент «диагональ → ребро» он
  // рождается из нуля и дальше растёт непрерывно — без скачка ширины капли.
  let seam = 0;

  if (x.gap > 0) {
    seam = Math.max(
      0,
      Math.min(c1.y + c1.h, c2.y + c2.h) - Math.max(c1.y, c2.y),
    );
  } else if (y.gap > 0) {
    seam = Math.max(
      0,
      Math.min(c1.x + c1.w, c2.x + c2.w) - Math.max(c1.x, c2.x),
    );
  }

  return {
    a: { x: x.from + nx * r1, y: y.from + ny * r1 },
    b: { x: x.to - nx * r2, y: y.to - ny * r2 },
    gap: dist - r1 - r2,
    seam,
    nx,
    ny,
  };
};

/**
 * Контакты тела с кромкой рамки: 4 прямых участка и 4 дуги внутренних углов.
 *
 * Каждая фигура считается независимо, поэтому на 45° обе стены равноудалены
 * и обе дают контакт — выбора «какая ближе» нет, скачка нет по построению.
 * Порядок результата: [верх, низ, лево, право, ЛВ, ПВ, ЛН, ПН].
 */
export const contactsWithFrame = (body: Body, frame: FrameSpec): Contact[] => {
  const rw = clampRadius(body);
  const core = coreOf(body);
  const left = frame.border;
  const top = frame.border;
  const right = frame.w - frame.border;
  const bottom = frame.h - frame.border;
  // Радиус дуги внутреннего угла и её центр. append_border рисует рамку так,
  // что заданный screenRadius — это радиус ВНУТРЕННЕГО угла, а центр дуги
  // лежит на border внутрь от края экрана; прямые полосы жидкости начинаются
  // там, где кончается дуга: border + screenRadius.
  const arc = frame.screenRadius;

  /** Контакт по точке q на кромке рамки: тело ищем со своей стороны. */
  const fromEdge = (q: Point, seam: number): Contact => {
    // Ближайшая к q точка сердцевины тела — «квадратная» проекция.
    const qx = Math.max(core.x, Math.min(q.x, core.x + core.w));
    const qy = Math.max(core.y, Math.min(q.y, core.y + core.h));
    const dx = q.x - qx;
    const dy = q.y - qy;
    const dist = Math.hypot(dx, dy);
    // При касании (dist = 0) нормаль не определена; берём любую — длина
    // капсулы от этого не зависит, торец всё равно внутри тела.
    const nx = dist === 0 ? 1 : dx / dist;
    const ny = dist === 0 ? 0 : dy / dist;

    return {
      a: { x: qx + nx * rw, y: qy + ny * rw },
      b: q,
      gap: dist - rw,
      seam,
      nx,
      ny,
    };
  };

  /** Прямая стена: вдоль — середина стыка, поперёк — перпендикуляр. */
  const side = (
    horizontal: boolean,
    fixed: number,
    from: number,
    to: number,
  ): Contact => {
    const span = horizontal
      ? axisGap(core.x, core.x + core.w, from, to)
      : axisGap(core.y, core.y + core.h, from, to);
    // Стык — прямая часть стороны окна (между скруглениями), попавшая на
    // прямой участок стены. Тот же смысл, что у contactBetween: seam из нуля.
    const spanFrom = horizontal ? core.x : core.y;
    const spanTo = horizontal ? core.x + core.w : core.y + core.h;
    const seam = Math.max(0, Math.min(to, spanTo) - Math.max(from, spanFrom));
    const q = horizontal ? { x: span.to, y: fixed } : { x: fixed, y: span.to };

    return fromEdge(q, seam);
  };

  const sides = [
    side(true, top, left + arc, right - arc),
    side(true, bottom, left + arc, right - arc),
    side(false, left, top + arc, bottom - arc),
    side(false, right, top + arc, bottom - arc),
  ];

  // Дуги: центр угла и знак сектора, смотрящего В УГОЛ экрана (от комнаты).
  // Дуга — вогнутая граница материала рамки; тело стоит с другой стороны,
  // поэтому точка дуги ищется со стороны угла.
  const corners = [
    { cx: left + arc, cy: top + arc, sx: -1, sy: -1 }, // ЛВ
    { cx: right - arc, cy: top + arc, sx: 1, sy: -1 }, // ПВ
    { cx: left + arc, cy: bottom - arc, sx: -1, sy: 1 }, // ЛН
    { cx: right - arc, cy: bottom - arc, sx: 1, sy: 1 }, // ПН
  ];
  const arcs = corners.map((c) => {
    // Направление от центра дуги к ближайшей точке сердцевины, прижатое к
    // сектору дуги. Тело в комнате лежит по другую сторону от сектора, и
    // прижатие даёт ноль — тогда точка — середина дуги (sx, sy — диагональ):
    // на кромке и без прыжка при движении окна. Для тела сбоку от дуги
    // прижатие даёт конец дуги, совпадающий с концом прямой стены.
    const px = Math.max(core.x, Math.min(c.cx, core.x + core.w));
    const py = Math.max(core.y, Math.min(c.cy, core.y + core.h));
    const vx = Math.max(0, (px - c.cx) * c.sx) * c.sx;
    const vy = Math.max(0, (py - c.cy) * c.sy) * c.sy;
    const len = Math.hypot(vx, vy);
    const ux = len === 0 ? c.sx / Math.SQRT2 : vx / len;
    const uy = len === 0 ? c.sy / Math.SQRT2 : vy / len;
    return fromEdge({ x: c.cx + arc * ux, y: c.cy + arc * uy }, 0);
  });

  return [...sides, ...arcs];
};
