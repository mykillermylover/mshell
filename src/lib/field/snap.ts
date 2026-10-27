import {
  type Body,
  type Contact,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '@lib/field/geometry';

/** Tolerance for closing the chosen contact, px. */
const RESIDUAL = 0.5;
/** Minimum pair determinant: degenerate (collinear) normals. */
const MIN_PAIR_DET = 1e-6;
/** Margin for axial pushing: the bodies must not stay in contact. */
const EJECT_GAP = 0.5;

export interface SnapEnv {
  frame: FrameSpec;
  reach: number;
}

export interface SnapResult {
  x: number;
  y: number;
}

type ContactRef =
  { kind: 'frame'; index: number } | { kind: 'body'; body: Body };

interface RefContact {
  ref: ContactRef;
  contact: Contact;
}

interface Candidate {
  dx: number;
  dy: number;
  contacts: RefContact[];
  distance: number;
  key: string;
}

const moved = (body: Body, dx: number, dy: number): Body => ({
  ...body,
  x: body.x + dx,
  y: body.y + dy,
});

const contactFor = (
  ref: ContactRef,
  body: Body,
  env: SnapEnv,
): Contact | null => {
  if (ref.kind === 'frame') {
    return contactsWithFrame(body, env.frame)[ref.index] ?? null;
  }

  return contactBetween(body, ref.body);
};

const allContacts = (
  self: Body,
  env: SnapEnv,
  others: Body[],
): RefContact[] => {
  const out: RefContact[] = [];

  for (const [index, contact] of contactsWithFrame(self, env.frame).entries()) {
    out.push({ ref: { kind: 'frame', index }, contact });
  }

  for (const other of others) {
    const contact = contactBetween(self, other);

    if (contact) {
      out.push({ ref: { kind: 'body', body: other }, contact });
    }
  }

  return out;
};

const keyOf = (contacts: RefContact[]): string =>
  contacts
    .map(({ contact }) =>
      [contact.a.x, contact.a.y, contact.b.x, contact.b.y]
        .map((value) => value.toFixed(3))
        .join(','),
    )
    .sort()
    .join('|');

/** Intersection tolerance, px. */
const OVERLAP = 0.01;

/** Overlap along an axis: > 0 is an intersection, < 0 is a gap. */
const overlapX = (first: Body, second: Body): number =>
  Math.min(first.x + first.w, second.x + second.w) -
  Math.max(first.x, second.x);

const overlapY = (first: Body, second: Body): number =>
  Math.min(first.y + first.h, second.y + second.h) -
  Math.max(first.y, second.y);

/**
 * Intersection depth of the bounding rectangles.
 *
 * The cores may merge into a point (`contactBetween` → null) before the
 * rectangles do: with `windowRadius = 0` an exact joint is such a touch,
 * and it is allowed. So the fallback criterion is the rectangles.
 */
const boxOverlap = (first: Body, second: Body): number =>
  Math.min(overlapX(first, second), overlapY(first, second));

const insideFrame = (body: Body, frame: FrameSpec): boolean =>
  body.x >= frame.border - OVERLAP &&
  body.y >= frame.border - OVERLAP &&
  body.x + body.w <= frame.w - frame.border + OVERLAP &&
  body.y + body.h <= frame.h - frame.border + OVERLAP;

const overlaps = (body: Body, env: SnapEnv, others: Body[]): boolean => {
  if (!insideFrame(body, env.frame)) {
    return true;
  }

  for (const other of others) {
    const contact = contactBetween(body, other);

    if (contact ? contact.gap < -OVERLAP : boxOverlap(body, other) > OVERLAP) {
      return true;
    }
  }

  return contactsWithFrame(body, env.frame).some(
    (contact) => contact.gap < -OVERLAP,
  );
};

const make = (
  self: Body,
  env: SnapEnv,
  others: Body[],
  contacts: RefContact[],
): Candidate | null => {
  const first = contacts[0];

  if (!first) {
    return null;
  }

  // Pairs are only from two contacts: triples are overdetermined.
  if (contacts.length > 2) {
    return null;
  }

  let dx: number;
  let dy: number;

  if (contacts.length === 1) {
    dx = first.contact.nx * first.contact.gap;
    dy = first.contact.ny * first.contact.gap;
  } else {
    const [a, b] = contacts;
    const det = a.contact.nx * b.contact.ny - a.contact.ny * b.contact.nx;

    if (Math.abs(det) < MIN_PAIR_DET) {
      return null;
    }

    dx = (a.contact.gap * b.contact.ny - a.contact.ny * b.contact.gap) / det;
    dy = (a.contact.nx * b.contact.gap - a.contact.gap * b.contact.nx) / det;
  }

  const next = moved(self, dx, dy);

  for (const item of contacts) {
    const after = contactFor(item.ref, next, env);

    if (!after) {
      // The cores merged into a point: for a body with `windowRadius = 0` this is
      // an exact joint of the rectangles, but not for the frame or a body stuck deep into it.
      if (
        item.ref.kind === 'body' &&
        boxOverlap(next, item.ref.body) <= OVERLAP
      ) {
        continue;
      }

      return null;
    }

    if (Math.abs(after.gap) > RESIDUAL) {
      return null;
    }
  }

  if (overlaps(next, env, others)) {
    return null;
  }

  return {
    dx,
    dy,
    contacts,
    distance: Math.hypot(dx, dy),
    key: keyOf(contacts),
  };
};

const buildCandidates = (
  self: Body,
  env: SnapEnv,
  others: Body[],
  pool: RefContact[],
): Candidate[] => {
  const out: Candidate[] = [];

  for (const item of pool) {
    const candidate = make(self, env, others, [item]);

    if (candidate) {
      out.push(candidate);
    }
  }

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const candidate = make(self, env, others, [pool[i], pool[j]]);

      if (candidate) {
        out.push(candidate);
      }
    }
  }

  return out;
};

const eject = (self: Body, env: SnapEnv, others: Body[]): SnapResult | null => {
  const candidates: Candidate[] = [];

  for (const other of others) {
    const dx = overlapX(self, other);
    const dy = overlapY(self, other);

    if (dx <= 0 || dy <= 0) {
      continue;
    }

    // Push along the axes: in a deep overlap there is no normal anymore.
    const pushes: [number, number][] = [
      [-(dx + EJECT_GAP), 0],
      [dx + EJECT_GAP, 0],
      [0, -(dy + EJECT_GAP)],
      [0, dy + EJECT_GAP],
    ];

    for (const [dx, dy] of pushes) {
      const next = moved(self, dx, dy);

      if (!overlaps(next, env, others)) {
        candidates.push({
          dx,
          dy,
          contacts: [],
          distance: Math.hypot(dx, dy),
          key: '',
        });
      }
    }
  }

  // Fallback: contact normals did not close (the body sank into the
  // frame material deeper than the radius), but the topology still allows it - fit
  // the body inside the frame.
  const clampX =
    Math.min(
      Math.max(self.x, env.frame.border),
      env.frame.w - env.frame.border - self.w,
    ) - self.x;
  const clampY =
    Math.min(
      Math.max(self.y, env.frame.border),
      env.frame.h - env.frame.border - self.h,
    ) - self.y;
  const clamped = moved(self, clampX, clampY);

  if (
    (clampX !== 0 || clampY !== 0) &&
    insideFrame(clamped, env.frame) &&
    !overlaps(clamped, env, others)
  ) {
    candidates.push({
      dx: clampX,
      dy: clampY,
      contacts: [],
      distance: Math.hypot(clampX, clampY),
      key: '',
    });
  }

  const best = pick(candidates);

  return best ? { x: self.x + best.dx, y: self.y + best.dy } : null;
};

const pick = (candidates: Candidate[]): Candidate | null => {
  let best: Candidate | null = null;

  for (const candidate of candidates) {
    if (
      !best ||
      candidate.contacts.length > best.contacts.length ||
      (candidate.contacts.length === best.contacts.length &&
        (candidate.distance < best.distance ||
          (candidate.distance === best.distance && candidate.key < best.key)))
    ) {
      best = candidate;
    }
  }

  return best;
};

/**
 * Magnet: where to place window `self` to close the nearest contact.
 *
 * Trigger: a positive gap no greater than `reach` means attraction; a negative
 * gap or merged cores means pushing out. Candidates are every contact
 * (frame walls and arcs, bodies) alone and in pairs: solving the "normal ×
 * gap" system. Choice: more contacts, then shorter travel, then the contacts key.
 * If contacts can't push it out, the fallback is axial pushes
 * out of bodies, then fitting the body into the frame.
 * `null` means there is no contact nearby or nothing can close it.
 */
export function snapTo(
  env: SnapEnv,
  self: Body,
  others: Body[] = [],
): SnapResult | null {
  const contacts = allContacts(self, env, others);
  const negative = contacts.filter(({ contact }) => contact.gap < 0);
  const deep = others.some((other) => contactBetween(self, other) === null);

  if (negative.length > 0 || deep) {
    const best = pick(buildCandidates(self, env, others, negative));

    return best
      ? { x: self.x + best.dx, y: self.y + best.dy }
      : eject(self, env, others);
  }

  const positive = contacts.filter(
    ({ contact }) => contact.gap >= 0 && contact.gap <= env.reach,
  );
  const best = pick(buildCandidates(self, env, others, positive));

  return best ? { x: self.x + best.dx, y: self.y + best.dy } : null;
}
