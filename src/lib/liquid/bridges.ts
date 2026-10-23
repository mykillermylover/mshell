// Мостик — единственный примитив соединения: материал, натянутый между
// ближайшими точками двух кромок. Здесь только геометрия; как его рисовать
// (осевая плашка или штрих с круглыми торцами) решает LiquidField по BridgeShape.
import {
  type Body,
  type Contact,
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from './geometry';

export interface Bridge {
  centerX: number;
  centerY: number;
  /** Длина вдоль нормали a→b. */
  length: number;
  /** Ширина поперёк нормали, вдоль стыка. */
  width: number;
  /** Поворот в радианах — направление a→b (как Math.atan2); мостик симметричен. */
  angle: number;
}

export interface BridgeSpec {
  frame: FrameSpec;
  /** Зазор, на котором капля умирает. */
  reach: number;
  /** Полуширина капли при стыке точка-в-точку (нет общего участка рёбер). */
  cornerHalfWidth: number;
  /** Насколько материал заходит внутрь тела, чтобы blur сварил стык. */
  intoBody: number;
}

/** Нахлёст мостика внутрь тела: 2σ; +2 px прячет торец под телом. */
const OVERLAP_SIGMAS = 2;
const OVERLAP_PX = 2;
/** Тоньше половины пикселя порог всё равно съест. */
const MIN_HALF_WIDTH = 0.5;
/** Поперечная составляющая нормали меньше этого — мостик осевой. */
const AXIS_EPSILON = 1e-9;

/** Числа капсулы из σ размытия и дальности магнита. */
export const bridgeSpecFor = (
  frame: FrameSpec,
  opts: { sigma: number; reach: number },
): BridgeSpec => {
  const overlap =
    Math.ceil(OVERLAP_SIGMAS * Math.max(1, opts.sigma)) + OVERLAP_PX;
  return {
    frame,
    reach: opts.reach,
    cornerHalfWidth: overlap,
    intoBody: overlap,
  };
};

/**
 * Полуширина капли: base·(1 − gap/reach), base = max(seam/2, cornerHalfWidth).
 *
 *  - грань к грани: seam — длина общего участка прямых сторон, при контакте
 *    капля занимает его целиком;
 *  - угол к углу, к дуге и в момент перехода «диагональ → ребро» seam = 0,
 *    поэтому base держится не ниже cornerHalfWidth: капля рождается тонкой
 *    и растёт линейно, а не появляется сразу широкой.
 * Перелёт (gap < 0) считаем контактом: ширина не падает ниже максимума.
 */
export const halfWidth = (contact: Contact, spec: BridgeSpec) => {
  const gap = Math.max(0, contact.gap);
  if (gap >= spec.reach) {
    return 0;
  }
  const base = Math.max(contact.seam / 2, spec.cornerHalfWidth);
  return base * (1 - gap / spec.reach);
};

/** Контакт с индексом фичи рамки или соседа — для выбора ближайших. */
interface IndexedContact {
  index: number;
  contact: Contact;
}

/** Зазоры, отличающиеся меньше этого, считаем равными: симметрию не рвём. */
const TIE_EPSILON = 1e-6;
/** Максимум связей на тело в каждом отношении: рамка и соседи отдельно. */
const CONTACT_LIMIT = 3;

/**
 * До CONTACT_LIMIT ближайших; равные зазоры на границе лимита не режутся.
 * Сравнение по зазору, затем по индексу — детерминированный tie-break.
 */
const pickNearest = (items: IndexedContact[]): IndexedContact[] => {
  const sorted = items.sort(
    (a, b) => a.contact.gap - b.contact.gap || a.index - b.index,
  );
  const limit = Math.min(CONTACT_LIMIT, sorted.length);
  const cutoff = sorted[limit - 1]?.contact.gap ?? Number.POSITIVE_INFINITY;

  return sorted.filter((item) => item.contact.gap <= cutoff + TIE_EPSILON);
};

/**
 * Все мостики сцены. Для рамки материал заканчивается на внутренней кромке
 * (за кольцо не лезем), для тел — заходит внутрь на intoBody.
 *
 * Мостик — часть непрерывного поля: он остаётся и при отрицательном зазоре
 * (перелёт easeOutBack и остаток магнита), пока у контакта есть нормаль и
 * длина мостика > 0. Закон ширины клампит gap в 0, поэтому на перелёте
 * ширина не падает и мостик не мигает. У тела до трёх контактов с рамкой и
 * до трёх с соседями — бюджеты раздельные, иначе в углу рамки стены
 * съедают слот соседа. Пара рисуется, только если её выбрали оба тела.
 */
export const bridges = (bodies: Body[], spec: BridgeSpec): Bridge[] => {
  const out: Bridge[] = [];
  // Заход в тело не больше самого тела: у тонкой губы капсула иначе прорастает
  // насквозь, и её blur рисует свечение в комнате мимо тела.
  const into = (body: Body) => Math.min(spec.intoBody, body.w, body.h);
  const add = (contact: Contact, intoB: number, intoA = spec.intoBody) => {
    const half = halfWidth(contact, spec);
    if (half < MIN_HALF_WIDTH) {
      return;
    }
    const length = contact.gap + intoA + intoB;
    if (length <= 0) {
      return; // перелёт глубже нахлёста: тела уже слиты
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

  // 1. Контакты с рамкой: у каждого тела свой бюджет, независимый от соседей.
  // Flush-контакт (gap = 0) оставляем: мостик прижатого тела своим размытым
  // торцом заливает нишу в стыке с рамкой. Перелёт в материал рамки на время
  // твина тоже не прячем — иначе мостик мигает в момент примагничивания.
  const frameCandidates: IndexedContact[][] = bodies.map((body) =>
    contactsWithFrame(body, spec.frame).map((contact, index) => ({
      index,
      contact,
    })),
  );

  // 2. Пары тел, которые ещё не слиты. Каждая пара считается один раз.
  // Широкая фаза по AABB: скруглённое тело лежит внутри своего прямоугольника,
  // поэтому зазор тел не меньше зазора прямоугольников. Если прямоугольники
  // дальше reach — точную геометрию пары можно не считать (в толпе это
  // отсекает большинство пар).
  const outOfReach = (a: Body, b: Body) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return dx * dx + dy * dy > spec.reach * spec.reach;
  };
  const pairContacts = new Map<string, Contact>();
  const bodyCandidates: IndexedContact[][] = bodies.map(() => []);

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (outOfReach(bodies[i], bodies[j])) {
        continue;
      }
      const contact = contactBetween(bodies[i], bodies[j]);

      if (!contact) {
        continue;
      }

      pairContacts.set(`${i}:${j}`, contact);
      bodyCandidates[i].push({ index: j, contact });
      bodyCandidates[j].push({ index: i, contact });
    }
  }

  // 3. Раздельные бюджеты: рамка и соседи не конкурируют за одни слоты.
  // Равные зазоры на границе лимита не режутся — иначе симметричные сцены
  // (45° к углу, 4 равноудалённых соседа) ломаются.
  const chosen: Set<number>[] = bodies.map(() => new Set());

  for (const [i, body] of bodies.entries()) {
    for (const item of pickNearest(frameCandidates[i])) {
      add(item.contact, 0, into(body));
    }
    for (const item of pickNearest(bodyCandidates[i])) {
      chosen[i].add(item.index);
    }
  }

  // 4. Пара остаётся, только если оба тела выбрали друг друга.
  for (const [key, contact] of pairContacts) {
    const [i, j] = key.split(':').map(Number);

    if (chosen[i].has(j) && chosen[j].has(i)) {
      add(contact, into(bodies[j]), into(bodies[i]));
    }
  }

  return out;
};

/**
 * Как рисовать мостик:
 *  - осевой (нормаль вдоль x или y) — скруглённый прямоугольник без поворота:
 *    это быстрый rounded-color op в Gsk;
 *  - диагональный — штрих с круглыми торцами: та же капсула. Плашку здесь не
 *    повернуть, поэтому идём штрихом (один узел); на осевых он заметно дороже,
 *    поэтому только для диагоналей.
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

export const bridgeShape = (bridge: Bridge): BridgeShape | null => {
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

  // Штрих с круглыми торцами — та же капсула (стадион), что и скруглённая
  // плашка: ось вдоль более длинной стороны, толщина — меньшая. В касании
  // L = W, то есть круг: рисуем его плашкой (дешёвый rounded-color op),
  // чтобы ширина не прыгала при переходе капсула → blur.
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
};
