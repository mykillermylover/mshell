import {
  type Body,
  type Contact,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from './liquid/geometry';

/** Допуск закрытия выбранного контакта, px. */
const RESIDUAL = 0.5;
/** Минимальный детерминант пары: вырожденные (коллинеарные) нормали. */
const MIN_PAIR_DET = 1e-6;
/** Запас при осевом выпихивании: тела не должны остаться в контакте. */
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
  { kind: 'frame'; index: number } | { kind: 'body'; index: number };

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
  others: Body[],
): Contact | null => {
  if (ref.kind === 'frame') {
    return contactsWithFrame(body, env.frame)[ref.index] ?? null;
  }

  return contactBetween(body, others[ref.index]);
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

  for (const [index, other] of others.entries()) {
    const contact = contactBetween(self, other);

    if (contact) {
      out.push({ ref: { kind: 'body', index }, contact });
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

/** Допуск пересечения, px. */
const OVERLAP = 0.01;

/**
 * Глубина пересечения ограничивающих прямоугольников.
 *
 * Сердцевины могут слипнуться в точку (`contactBetween` → null) раньше, чем
 * прямоугольники: при `windowRadius = 0` точный стык и есть такое касание,
 * и он допустим. Поэтому запасной критерий — прямоугольники.
 */
const boxOverlap = (first: Body, second: Body): number =>
  Math.min(
    Math.min(first.x + first.w, second.x + second.w) -
      Math.max(first.x, second.x),
    Math.min(first.y + first.h, second.y + second.h) -
      Math.max(first.y, second.y),
  );

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

  // Пары — только из двух контактов: тройки переопределены.
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
    const after = contactFor(item.ref, next, env, others);

    if (!after) {
      // Сердцевины слиплись в точку: у тела при `windowRadius = 0` это
      // точный стык прямоугольников, у рамки и глубокого леза — нет.
      if (
        item.ref.kind === 'body' &&
        boxOverlap(next, others[item.ref.index]) <= OVERLAP
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
    const overlapX =
      Math.min(self.x + self.w, other.x + other.w) - Math.max(self.x, other.x);
    const overlapY =
      Math.min(self.y + self.h, other.y + other.h) - Math.max(self.y, other.y);

    if (overlapX <= 0 || overlapY <= 0) {
      continue;
    }

    // Толкаем по осям: у глубокого перекрытия нормали уже нет.
    const pushes: [number, number][] = [
      [-(overlapX + EJECT_GAP), 0],
      [overlapX + EJECT_GAP, 0],
      [0, -(overlapY + EJECT_GAP)],
      [0, overlapY + EJECT_GAP],
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

  // Запасной вариант: контакты по нормалям не закрылись (тело просело в
  // материал рамки глубже радиуса), но топология ещё позволяет — вписать
  // тело внутрь рамки.
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
 * Магнит: куда поставить окно `self`, чтобы закрыть ближайший контакт.
 *
 * Триггер: положительный зазор не больше `reach` — притяжение; отрицательный
 * зазор или слипшиеся сердцевины — выпихивание. Кандидаты — каждый контакт
 * (стены и дуги рамки, тела) в одиночку и парами: решение системы «нормаль ×
 * зазор». Выбор: больше контактов, затем короче ход, затем ключ контактов.
 * Если контакты выпихнуть не дают, запасной вариант — осевые выталкивания
 * из тел, затем вписать тело в рамку.
 * `null` — рядом нет контакта или закрыть его нечем.
 */
export const snapTo = (
  env: SnapEnv,
  self: Body,
  others: Body[] = [],
): SnapResult | null => {
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
};
