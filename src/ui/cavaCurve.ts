// Geometry of the curve visualizer: pure numbers, no GTK, so it is testable
// in node. MCava only feeds the segments into a Gsk path.
//
// The points are invisible: only a Catmull-Rom spline through them is drawn.
// Each span is split at its middle point, which also carries the sag - a
// single cubic per span cannot be bowed without moving its ends.

/** One cubic Bezier with absolute coordinates. */
export interface CurveSegment {
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
}

export interface PolylinePoint {
  x: number;
  y: number;
}

/** Straight-line counterpart of `curveSegments`: one vertex per value. */
export function polylinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
): PolylinePoint[] {
  const count = values.length;
  if (count === 0 || width <= 0 || height <= 0) {
    return [];
  }

  const usable = Math.max(0, height - 2 * pad);
  const y = (value: number) => pad + (1 - level(value)) * usable;

  if (count === 1) {
    const line = y(values[0] ?? 0);
    return [
      { x: 0, y: line },
      { x: width, y: line },
    ];
  }

  const step = width / (count - 1);
  return values.map((value, i) => ({ x: i * step, y: y(value) }));
}

export interface CurveOptions {
  /**
   * Wave multiplier, unitless: a span bows at its middle by
   * `(level(a) + level(b)) / 2 * sag` of the drawable height, toward zero.
   * `0` leaves the line straight through the points, `1` bows a loud span by
   * half its height. Louder spans therefore wave more.
   */
  sag?: number;
}

/** Catmull-Rom: the control point sits 1/6 of the way to the next point. */
const TENSION = 1 / 6;

const level = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Points spread evenly across `width`, heights from `values`, growing upward.
 * `pad` keeps the line off the edges - a full level would otherwise touch the
 * top and a silence the bottom.
 *
 * `sag` bows every span at its middle, toward zero (the bottom): by the mean
 * level of the two points times `sag`, so a loud pair waves more than a quiet
 * one and silence stays flat. The points themselves stay put, so the bow
 * comes and goes without moving the shape.
 */
export function curveSegments(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
  options: CurveOptions = {},
): CurveSegment[] {
  const count = values.length;
  if (count === 0 || width <= 0 || height <= 0) {
    return [];
  }

  const sag = options.sag ?? 0;
  const usable = Math.max(0, height - 2 * pad);
  const y = (value: number) => pad + (1 - level(value)) * usable;

  // A span bows by the mean level of its points: silence stays flat, a loud
  // pair waves most.
  const bow = (levelA: number, levelB: number) =>
    ((levelA + levelB) / 2) * sag * usable;

  // A single value has no span: it is a flat line across the whole width.
  if (count === 1) {
    const value = values[0] ?? 0;
    return bowAcross(0, width, y(value), bow(level(value), level(value)));
  }

  const step = width / (count - 1);
  const px = (i: number) => i * step;
  const py = (i: number) => y(values[i] ?? 0);
  const pl = (i: number) => level(values[i] ?? 0);

  const segments: CurveSegment[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    segments.push(
      ...spanSegments(
        { x: px(i), y: py(i) },
        { x: px(i + 1), y: py(i + 1) },
        { x: px(Math.max(0, i - 1)), y: py(Math.max(0, i - 1)) },
        {
          x: px(Math.min(count - 1, i + 2)),
          y: py(Math.min(count - 1, i + 2)),
        },
        bow(pl(i), pl(i + 1)),
      ),
    );
  }

  return segments;
}

interface Point {
  x: number;
  y: number;
}

/** The whole width as one span, no neighbours: a bowed flat line. */
function bowAcross(x1: number, x2: number, line: number, sag: number) {
  return spanSegments(
    { x: x1, y: line },
    { x: x2, y: line },
    { x: x1, y: line },
    { x: x2, y: line },
    sag,
  );
}

/**
 * One span between two points, split at its middle so the middle can sag.
 * The control points come from Catmull-Rom through (prev, a, mid, b, next);
 * at the middle they share the tangent of both halves, so the join is smooth.
 */
function spanSegments(
  a: Point,
  b: Point,
  prev: Point,
  next: Point,
  sag: number,
): CurveSegment[] {
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };

  const first: CurveSegment = {
    x1: a.x,
    y1: a.y,
    cx1: a.x + (mid.x - prev.x) * TENSION,
    cy1: a.y + (mid.y - prev.y) * TENSION,
    cx2: mid.x - (b.x - a.x) * TENSION,
    cy2: mid.y - (b.y - a.y) * TENSION,
    x2: mid.x,
    y2: mid.y,
  };

  const second: CurveSegment = {
    x1: mid.x,
    y1: mid.y,
    cx1: mid.x + (b.x - a.x) * TENSION,
    cy1: mid.y + (b.y - a.y) * TENSION,
    cx2: b.x - (next.x - mid.x) * TENSION,
    cy2: b.y - (next.y - mid.y) * TENSION,
    x2: b.x,
    y2: b.y,
  };

  return [first, second];
}
