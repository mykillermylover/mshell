import assert from 'node:assert/strict';
import test from 'node:test';

import type { Body } from '../lib/goo/geometry.ts';
import { addedArea, cornerRoomDirty, reaches } from './support/raster.ts';
import { body, FIELD, NOTES, render } from './support/scenarios.ts';
import { scenarioList } from './support/scenarios.ts';

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const insideBody = (b) => (x: number, y: number) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const topStrip = (x: number, y: number) =>
  x >= FIELD.border + FIELD.screenRadius &&
  x <= FIELD.width - FIELD.border - FIELD.screenRadius &&
  y >= 0 &&
  y <= FIELD.border;
const frameL = (x: number, y: number) => x <= FIELD.border || y <= FIELD.border;

test('одинокое окно не толстеет: за пределами материала слизи нет', () => {
  // Базовая площадь — залив самой рамки у вогнутых дуг углов: он не связан
  // с окнами и мостиками, поэтому вычитаем его.
  const baseline = addedArea(render([]));
  assert.equal(addedArea(render([body(500, 300, NOTES)])) - baseline, 0);
});

test('мостик тянет слизь на 20 px, одного blur на столько не хватает', () => {
  const a = body(500, 24, NOTES); // верхняя кромка в 20 px от внутренней кромки
  assert.equal(reaches(render([a]), center(a), topStrip), true);
  assert.equal(
    reaches(render([a], { withoutBridges: true }), center(a), topStrip),
    false,
  );
});

test('в комнате у угла экрана слизи нет, пока окна рядом нет', () => {
  // Вогнутый угол рамки не должен затекать blur-хвостами в комнату.
  assert.deepEqual(cornerRoomDirty(render([]), FIELD), []);
});

test('рамка в слое слизи повторяет кривую: на дуге угла есть материал', () => {
  // Дуга — часть кромки. Если на ней нет материала, мостик к углу упирается
  // в пустоту: после порога он висит отдельным комком в 14 px от кривой.
  // Точка — на диагонали угла, на 2 px внутрь материала от дуги.
  const raster = render([], { scale: 1 });
  const center = FIELD.border + FIELD.screenRadius;
  const t = Math.floor(center - (FIELD.screenRadius + 2) / Math.SQRT2);
  assert.equal(
    raster.alpha[t * raster.width + t],
    1,
    'на дуге угла нет слизи — рамка в слое слизи обрезана',
  );
});

const byName = (name: string) => {
  const found = scenarioList().find((s) => s.name === name);
  assert.ok(found, `сценарий ${name}`);
  return found;
};

test('диагональ: связь появляется один раз и симметрично исчезает', () => {
  const { frames } = byName('diagonal');
  const half = Math.floor(frames.length / 2);
  const forward = frames.slice(0, half);
  const back = frames.slice(half).reverse(); // те же d, что в forward
  const paths = (list: typeof forward) =>
    list.map((bodies) =>
      reaches(render(bodies), center(bodies[1]), insideBody(bodies[0])),
    );
  const fwd = paths(forward);
  const bwd = paths(back);
  const appear = fwd.indexOf(true);
  assert.ok(appear > 0, 'в начале пути связи нет');
  assert.ok(
    fwd.slice(appear).every(Boolean),
    'по пути к контакту связь пропала',
  );
  assert.deepEqual(bwd, fwd, 'обратный путь: связь на других кадрах');
});

test('диагональ: добавленная площадь растёт без скачков', () => {
  // Кадры 0..30 — путь от 30 px до касания. Дальше корпуса нахлёстываются, и
  // площадь слизи за их пределами начинает уменьшаться — это не дефект.
  // scale 1: на половинном растре шаг = 2 px, и «шум» квантования сравним с
  // ростом площади.
  const frames = byName('diagonal').frames.slice(0, 31);
  // Базовая площадь — залив рамки у дуг углов (от окон не зависит).
  const baseline = addedArea(render([], { scale: 1 }));
  const areas = frames.map(
    (bodies) => addedArea(render(bodies, { scale: 1 })) - baseline,
  );
  assert.equal(
    areas[0],
    0,
    'на старте расстояние между скруглениями больше reach — мостика нет',
  );
  const top = Math.max(...areas);
  assert.ok(top > 0, 'мостик так и не появился');
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i] >= areas[i - 1] * 0.95, `кадр ${i}: площадь упала`);
    assert.ok(
      Math.abs(areas[i] - areas[i - 1]) < top * 0.3,
      `кадр ${i}: скачок площади ${areas[i - 1]} → ${areas[i]} (top ${top})`,
    );
  }
});

test('четыре стены: связь с рамкой наступает на одинаковом зазоре', () => {
  const walls = ['top', 'bottom', 'left', 'right'];
  const gaps = walls.map((wall) => {
    const { frames } = byName(`nook-${wall}`);
    const strips = {
      top: (x: number, y: number) =>
        y <= FIELD.border && x >= 14 && x <= FIELD.width - 14,
      bottom: (x: number, y: number) =>
        y >= FIELD.height - FIELD.border && x >= 14 && x <= FIELD.width - 14,
      left: (x: number, y: number) =>
        x <= FIELD.border && y >= 14 && y <= FIELD.height - 14,
      right: (x: number, y: number) =>
        x >= FIELD.width - FIELD.border && y >= 14 && y <= FIELD.height - 14,
    }[wall];
    // Меряем только подвижное окно: оно связано с соседом сбоку, и иначе
    // связь с рамкой «протекает» через соседа.
    const linked = ([, b]: Body[]) => reaches(render([b]), center(b), strips);
    const first = frames.findIndex(linked);
    assert.ok(first > 0, `${wall}: связь не наступила`);
    return { wall, first, connected: frames.slice(first).every(linked) };
  });
  for (const g of gaps) {
    assert.ok(g.connected, `${g.wall}: после появления связь пропала`);
  }
  // Одна сетка пикселей для всех стен: допускаем разницу в один кадр (2 px),
  // это квантование растра, а не скачок геометрии.
  for (const g of gaps) {
    assert.ok(
      Math.abs(g.first - gaps[0].first) <= 1,
      `стена ${g.wall}: другой зазор появления (${g.first} против ${gaps[0].first})`,
    );
  }
});

test('угол экрана: окно подходит по диагонали — связь есть раньше касания', () => {
  // Последний кадр окно уже касается рамки: там связь есть даже без мостиков,
  // поэтому проверять один последний кадр бессмысленно. Ищем кадр появления:
  // он должен быть до касания, и держать его обязан именно мостик.
  const { frames } = byName('corner');
  const linked = (bodies: Body[]) =>
    reaches(render(bodies), center(bodies[0]), frameL);
  const first = frames.findIndex(linked);
  assert.ok(first > 0, 'связь появилась уже в первом кадре');
  assert.ok(
    first < frames.length - 1,
    'связь появилась только когда окно уже касается рамки',
  );
  assert.ok(frames.slice(first).every(linked), 'после появления связь пропала');
  assert.equal(
    reaches(
      render(frames[first], { withoutBridges: true }),
      center(frames[first][0]),
      frameL,
    ),
    false,
    'связь дал не мостик, а один blur',
  );
});

test('снап: по всем кадрам твина связь не пропадает', () => {
  const { frames } = byName('snap');
  let seen = false;
  for (const bodies of frames) {
    const connected = reaches(
      render(bodies),
      center(bodies[0]),
      (x, y) => y <= FIELD.border,
    );
    if (seen) {
      assert.ok(connected, 'связь пропала во время твина');
    }
    seen ||= connected;
  }
  assert.ok(seen, 'после снапа связи нет');
});
