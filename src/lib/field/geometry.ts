// Liquid geometry: bodies are rounded rectangles, the frame edge is straight
// wall sections and inner-corner arcs. Here there is only the search for nearest points;
// no global "anchors" and no state.
import type { Point, Rect } from '@lib/geometry';

/** A body in field coordinates: a rectangle plus its corner radius. */
export interface Body extends Rect {
  /** Corner radius of the body (for windows it's `windowRadius`). */
  cornerRadius: number;
}

/** Contact points: a is on the first body, b is on the second; nx, ny is the normal a→b. */
export interface Contact {
  a: Point;
  b: Point;
  gap: number;
  /** Length of the shared section of straight sides (0 means a joint by corners/arc). */
  seam: number;
  nx: number;
  ny: number;
}

/** Inner frame edge: a rectangle inset by border with arc radius. */
export interface FrameSpec {
  w: number;
  h: number;
  border: number;
  screenRadius: number;
}

/** The radius that actually fits in the body (corners no larger than half a side). */
export function clampRadius(body: Body): number {
  return Math.max(0, Math.min(body.cornerRadius, body.w / 2, body.h / 2));
}

/**
 * Core: a rounded rectangle = rectangle ⊕ circle of radius R
 * (Minkowski sum). So all distances are measured between cores
 * and we subtract R1 + R2.
 */
const coreOf = (body: Body): Rect => {
  const r = clampRadius(body);
  return { x: body.x + r, y: body.y + r, w: body.w - 2 * r, h: body.h - 2 * r };
};

/**
 * The gap between two segments on the same axis and the points it is measured between.
 *
 * If the segments don't intersect, use the nearest ends. If they intersect, take
 * the MIDDLE of the shared section: it is born at the touch point and then moves
 * continuously. Otherwise, at the "diagonal → edge" transition the point would jump from a corner
 * to the middle of the side.
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

/** Nearest points of two bodies; null means the cores overlap (the bodies are already merged). */
export function contactBetween(first: Body, second: Body): Contact | null {
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
  // The joint is the intersection of the STRAIGHT side sections (that is, the cores): corner
  // rounding does not enter the joining edge. At the "diagonal → edge" moment it
  // is born from zero and then grows continuously - with no jump in blob width.
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
}

/**
 * Contacts of the body with the frame edge: 4 straight sections and 4 inner-corner arcs.
 *
 * Each figure is computed independently, so at 45° both walls are equidistant
 * and both give a contact - there is no choice of "which is closer", no jump by construction.
 * Result order: [top, bottom, left, right, TL, TR, BL, BR].
 */
export function contactsWithFrame(body: Body, frame: FrameSpec): Contact[] {
  const rw = clampRadius(body);
  const core = coreOf(body);
  const left = frame.border;
  const top = frame.border;
  const right = frame.w - frame.border;
  const bottom = frame.h - frame.border;
  // The radius of the inner-corner arc and its center. append_border draws the frame so
  // that the given screenRadius is the radius of the INNER corner, and the arc center
  // lies on border inward from the screen edge; the straight liquid strips start
  // where the arc ends: border + screenRadius.
  const arc = frame.screenRadius;

  /** Contact at point q on the frame edge: the body is searched on its own side. */
  const fromEdge = (q: Point, seam: number): Contact => {
    // The core point nearest to q - the "square" projection.
    const qx = Math.max(core.x, Math.min(q.x, core.x + core.w));
    const qy = Math.max(core.y, Math.min(q.y, core.y + core.h));
    const dx = q.x - qx;
    const dy = q.y - qy;
    const dist = Math.hypot(dx, dy);
    // On touch (dist = 0) the normal is undefined; take any - the capsule
    // length doesn't depend on it, the end cap stays inside the body anyway.
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

  /** Straight wall: along it the middle of the joint, across it the perpendicular. */
  const side = (
    horizontal: boolean,
    fixed: number,
    from: number,
    to: number,
  ): Contact => {
    const span = horizontal
      ? axisGap(core.x, core.x + core.w, from, to)
      : axisGap(core.y, core.y + core.h, from, to);
    // The joint is the straight part of the window side (between the roundings) that lands on
    // the straight wall section. Same meaning as in contactBetween: seam from zero.
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

  // Arcs: the corner center and the sign of the sector facing INTO the screen corner (from the interior).
  // The arc is the concave boundary of the frame material; the body stands on the other side,
  // so the arc point is searched from the corner side.
  const corners = [
    { cx: left + arc, cy: top + arc, sx: -1, sy: -1 }, // TL
    { cx: right - arc, cy: top + arc, sx: 1, sy: -1 }, // TR
    { cx: left + arc, cy: bottom - arc, sx: -1, sy: 1 }, // BL
    { cx: right - arc, cy: bottom - arc, sx: 1, sy: 1 }, // BR
  ];
  const arcs = corners.map((c) => {
    // The direction from the arc center to the nearest core point, clamped to
    // the arc sector. A body in the interior lies on the other side of the sector, and
    // the clamp gives zero - then the point is the middle of the arc (sx, sy - the diagonal):
    // on the edge and without a jump when the window moves. For a body beside the arc
    // the clamp gives the arc end, matching the end of the straight wall.
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
}
