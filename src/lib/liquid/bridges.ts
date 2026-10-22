// Мостик — единственный примитив соединения: капсула (повёрнутый скруглённый
// прямоугольник), натянутая между ближайшими точками двух кромок.
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
  /** Длина вдоль оси капсулы (от торца до торца). */
  length: number;
  /** Ширина поперёк оси (вдоль стыка). */
  width: number;
  /** Поворот в радианах — направление a→b (как Math.atan2); капсула симметрична. */
  angle: number;
}

/** Зазор слияния двух кромок: две параллельные кромки дают 0.5 на ≈1.35σ. */
const MERGE_SIGMAS = 1.35;
/** σ не меньше пикселя: иначе blur превращается в point-sample. */
const MIN_SIGMA = 1;

/** Нахлёст мостика внутрь тела: 2σ; +2 px прячет торец под телом. */
const OVERLAP_SIGMAS = 2;
const OVERLAP_PX = 2;
/** Тоньше половины пикселя порог всё равно съест. */
const MIN_HALF_WIDTH = 0.5;

export interface BridgeSpec {
  frame: FrameSpec;
  /** Зазор, на котором капля умирает. */
  reach: number;
  /** Полуширина капли при стыке точка-в-точку (нет общего участка рёбер). */
  cornerHalfWidth: number;
  /** Насколько материал заходит внутрь тела, чтобы blur сварил стык. */
  intoBody: number;
}

/**
 * σ размытия под meltRadius. Размытие — «колокол»: две параллельные кромки
 * сливаются, когда зазор падает до ≈1.35σ (замерено), поэтому σ = R/1.35.
 */
export const sigmaOf = (meltRadius: number) =>
  Math.max(MIN_SIGMA, meltRadius / MERGE_SIGMAS);

/** Видимая часть нахлёста мостика: 2σ. */
export const visibleOverlap = (meltRadius: number) =>
  Math.ceil(OVERLAP_SIGMAS * sigmaOf(meltRadius));

/** Полный нахлёст мостика внутрь тела: 2σ + 2 px (прячет торец под телом). */
export const bridgeOverlap = (meltRadius: number) =>
  visibleOverlap(meltRadius) + OVERLAP_PX;

/** Числа капсулы из настроек: нахлёст прячет торец под телом (2σ + 2 px). */
export const bridgeSpecFor = (
  frame: FrameSpec,
  opts: { meltRadius: number; reach: number },
): BridgeSpec => {
  const overlap = bridgeOverlap(opts.meltRadius);
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
 *    капля занимает его целиком — это прежний вид «сварено по шву»;
 *  - угол к углу, к дуге и в момент перехода «диагональ → ребро» seam = 0,
 *    поэтому base держится не ниже cornerHalfWidth: капля рождается тонкой
 *    и растёт, а в самый момент переключения не схлопывается.
 * Линейный рост (не корень): у самого reach blur видит уже тонкую нить,
 * а не широкую каплю; к контакту ширина всё равно доходит до base.
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

/**
 * Все мостики сцены. Для рамки материал заканчивается на внутренней кромке
 * (за кольцо не лезем — иначе у угла экрана blur покажет жидкость вне обводки),
 * для тел — заходит внутрь на intoBody.
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
      return;
    } // перелёт глубже нахлёста: тела уже слиты
    const shift = (contact.gap + intoB - intoA) / 2;
    const angle = Math.atan2(contact.ny, contact.nx);
    out.push({
      centerX: contact.a.x + contact.nx * shift,
      centerY: contact.a.y + contact.ny * shift,
      length,
      width: half * 2,
      angle,
    });
  };
  for (const body of bodies) {
    const limit = into(body);
    for (const contact of contactsWithFrame(body, spec.frame)) {
      add(contact, 0, limit);
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const contact = contactBetween(bodies[i], bodies[j]);
      if (contact) {
        add(contact, into(bodies[j]), into(bodies[i]));
      }
    }
  }
  return out;
};
