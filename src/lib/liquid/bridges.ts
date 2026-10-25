// Bridge — the only connection primitive: material stretched between
// the nearest points of two edges. Only geometry here; how to draw it
// (an axis-aligned rounded plate or a stroke with round end caps) is decided by LiquidField via BridgeShape.
import {
  type Body,
  type Contact,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '@lib/geometry';

export interface Bridge {
  centerX: number;
  centerY: number;
  /** Length along the normal a→b. */
  length: number;
  /** Width across the normal, along the seam. */
  width: number;
  /** Rotation in radians — direction a→b (like Math.atan2); the bridge is symmetric. */
  angle: number;
}

export interface BridgeSpec {
  frame: FrameSpec;
  /** Gap at which the blob dies. */
  reach: number;
  /** Half-width of the blob on point-to-point contact (no shared edge segment). */
  cornerHalfWidth: number;
  /** How far the material goes into the body so the blur welds the seam. */
  intoBody: number;
}

/** Bridge overlap into the body: 2σ; +2 px hides the end cap under the body. */
const OVERLAP_SIGMAS = 2;
const OVERLAP_PX = 2;
/** The threshold eats anything thinner than half a pixel anyway. */
const MIN_HALF_WIDTH = 0.5;
/** The transverse component of the normal below this — the bridge is axis-aligned. */
const AXIS_EPSILON = 1e-9;

/** Capsule numbers from the blur σ and magnet reach. */
export function bridgeSpecFor(
  frame: FrameSpec,
  opts: { sigma: number; reach: number },
): BridgeSpec {
  const overlap =
    Math.ceil(OVERLAP_SIGMAS * Math.max(1, opts.sigma)) + OVERLAP_PX;
  return {
    frame,
    reach: opts.reach,
    cornerHalfWidth: overlap,
    intoBody: overlap,
  };
}

/**
 * Blob half-width: base·(1 − gap/reach), base = max(seam/2, cornerHalfWidth).
 *
 *  - edge to edge: seam — the length of the shared straight-side segment; on contact
 *    the blob occupies all of it;
 *  - corner to corner, to an arc, and at the moment of the "diagonal → edge" transition seam = 0,
 *    so base stays at least cornerHalfWidth: the blob is born thin
 *    and grows linearly instead of appearing wide at once.
 * Overshoot (gap < 0) counts as contact: the width does not drop below the maximum.
 */
export function halfWidth(contact: Contact, spec: BridgeSpec): number {
  const gap = Math.max(0, contact.gap);
  if (gap >= spec.reach) {
    return 0;
  }
  const base = Math.max(contact.seam / 2, spec.cornerHalfWidth);
  return base * (1 - gap / spec.reach);
}

/** Gaps differing by less than this are considered equal: symmetry is not broken. */
const TIE_EPSILON = 1e-6;
/** Maximum links per body in each relation: frame and neighbors separately. */
const CONTACT_LIMIT = 3;

/**
 * Up to CONTACT_LIMIT nearest; equal gaps at the limit boundary are not cut.
 * The sort is stable, so with equal gaps the original order is preserved -
 * a deterministic tie-break without indices.
 */
const pickNearest = <T>(items: T[], gapOf: (item: T) => number): T[] => {
  const sorted = [...items].sort((a, b) => gapOf(a) - gapOf(b));
  const limit = Math.min(CONTACT_LIMIT, sorted.length);
  const cutoff = sorted[limit - 1] ? gapOf(sorted[limit - 1]) : Infinity;

  return sorted.filter((item) => gapOf(item) <= cutoff + TIE_EPSILON);
};

/**
 * All bridges of the scene. For the frame the material ends at the inner edge
 * (we do not go past the ring), for bodies — it goes inside by intoBody.
 *
 * A bridge is part of a continuous field: it remains even at a negative gap
 * (easeOutBack overshoot and the magnet remainder) as long as the contact has a normal and
 * the bridge length > 0. The width law clamps gap to 0, so on overshoot
 * the width does not drop and the bridge does not flicker. The link budget is CONTACT_LIMIT with
 * the frame and separately CONTACT_LIMIT with neighbors, otherwise in the frame corner the walls
 * eat the neighbor's slot; equal gaps at the limit boundary are not cut
 * (pickNearest). A pair is drawn only if both bodies chose it.
 */
export function bridges(bodies: Body[], spec: BridgeSpec): Bridge[] {
  const out: Bridge[] = [];
  // Inset into the body is no larger than the body itself: on a thin lip the capsule would otherwise grow
  // through, and its blur would draw a glow in the interior past the body.
  const into = (body: Body) => Math.min(spec.intoBody, body.w, body.h);
  const add = (contact: Contact, intoB: number, intoA = spec.intoBody) => {
    const half = halfWidth(contact, spec);
    if (half < MIN_HALF_WIDTH) {
      return;
    }
    const length = contact.gap + intoA + intoB;
    if (length <= 0) {
      return; // overshoot deeper than the overlap: the bodies are already merged
    }
    const shift = (contact.gap + intoB - intoA) / 2;
    out.push({
      centerX: contact.a.x + contact.nx * shift,
      centerY: contact.a.y + contact.ny * shift,
      length,
      width: half * 2,
      angle: Math.atan2(contact.ny, contact.nx),
    });
  };

  // Links of one body: contacts with the frame, with neighbors, and the chosen neighbors.
  interface BodyLink {
    body: Body;
    frame: Contact[];
    neighbors: Array<{ body: Body; contact: Contact }>;
    chosen: Set<Body>;
  }

  const links: BodyLink[] = bodies.map((body) => ({
    body,
    // Flush contact (gap = 0) is kept: the bridge of a flush body floods the niche at the seam
    // with the frame with its blurred end cap. The overshoot into the frame material during the
    // tween is also not hidden - otherwise the bridge flickers at the moment of snapping.
    frame: contactsWithFrame(body, spec.frame),
    neighbors: [],
    chosen: new Set(),
  }));

  // Pairs of bodies that are not merged yet. Broad phase by AABB: a rounded body
  // lies inside its rectangle, so the body gap is not less than the rectangle gap.
  // If the rectangles are farther than reach - the exact geometry of the pair
  // need not be computed (in a crowd this cuts off most pairs).
  const outOfReach = (a: Body, b: Body) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return dx * dx + dy * dy > spec.reach * spec.reach;
  };
  const pairs: Array<{ a: BodyLink; b: BodyLink; contact: Contact }> = [];

  for (let i = 0; i < links.length; i++) {
    for (let j = i + 1; j < links.length; j++) {
      const a = links[i];
      const b = links[j];

      if (outOfReach(a.body, b.body)) {
        continue;
      }
      const contact = contactBetween(a.body, b.body);

      if (!contact) {
        continue;
      }

      pairs.push({ a, b, contact });
      a.neighbors.push({ body: b.body, contact });
      b.neighbors.push({ body: a.body, contact });
    }
  }

  // Separate budgets: the frame and neighbors do not compete for the same slots.
  // Equal gaps at the limit boundary are not cut - otherwise symmetric scenes
  // (45° to a corner, 4 equidistant neighbors) break.
  for (const link of links) {
    for (const contact of pickNearest(link.frame, (c) => c.gap)) {
      add(contact, 0, into(link.body));
    }
    for (const neighbor of pickNearest(link.neighbors, (n) => n.contact.gap)) {
      link.chosen.add(neighbor.body);
    }
  }

  // A pair remains only if both bodies chose each other.
  for (const { a, b, contact } of pairs) {
    if (a.chosen.has(b.body) && b.chosen.has(a.body)) {
      add(contact, into(b.body), into(a.body));
    }
  }

  return out;
}

/**
 * How to draw the bridge:
 *  - axis-aligned (normal along x or y) — a rounded rectangle without rotation:
 *    this is a fast rounded-color op in Gsk;
 *  - diagonal — a stroke with round end caps: the same capsule. A plate cannot be
 *    rotated here, so we use a stroke (one node); on axis-aligned ones it is noticeably more expensive,
 *    so only for diagonals.
 */
export type BridgeShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number }
  | {
      kind: 'stroke';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
    };

export function bridgeShape(bridge: Bridge): BridgeShape {
  const { length, width } = bridge;
  const cos = Math.cos(bridge.angle);
  const sin = Math.sin(bridge.angle);
  const axisAligned = Math.min(Math.abs(cos), Math.abs(sin)) <= AXIS_EPSILON;

  if (axisAligned) {
    const alongX = Math.abs(cos) >= Math.abs(sin);
    const w = alongX ? length : width;
    const h = alongX ? width : length;
    return {
      kind: 'rect',
      x: bridge.centerX - w / 2,
      y: bridge.centerY - h / 2,
      w,
      h,
      radius: Math.min(w, h) / 2,
    };
  }

  // A stroke with round end caps — the same capsule (stadium) as a rounded
  // plate: the axis is along the longer side, the thickness is the smaller. On contact
  // L = W, that is a circle: we draw it as a plate (a cheap rounded-color op),
  // so the width does not jump at the capsule → blur transition.
  const long = Math.max(length, width);
  const short = Math.min(length, width);
  const segment = long - short;
  if (segment <= 0) {
    return {
      kind: 'rect',
      x: bridge.centerX - short / 2,
      y: bridge.centerY - short / 2,
      w: short,
      h: short,
      radius: short / 2,
    };
  }
  const ux = length >= width ? cos : -sin;
  const uy = length >= width ? sin : cos;
  const dx = (ux * segment) / 2;
  const dy = (uy * segment) / 2;
  return {
    kind: 'stroke',
    x1: bridge.centerX - dx,
    y1: bridge.centerY - dy,
    x2: bridge.centerX + dx,
    y2: bridge.centerY + dy,
    width: short,
  };
}
