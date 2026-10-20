import { Gdk, Gtk } from 'ags/gtk4'; // первым: фиксирует Gtk 4 до загрузки Gsk
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';

import { type Reactive, snapshot } from './config';
import { type Bridge, bridges, bridgeSpecFor, sigmaOf } from './goo/bridges';
import type { Body } from './goo/geometry';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldStyle {
  border: number; // толщина рамки, px
  screenRadius: number; // радиус углов экрана, px (точный)
  windowRadius: number; // радиус углов окон, px (точный)
  // Радиус «кривой», которой слизь соединяет тела (окно↔окно, окно↔рамка), px.
  // При таком зазоре между кромками они уже слипаются, а внутренний угол стыка
  // скругляется примерно этим радиусом — одно число задаёт и дальность, и кривизну.
  meltRadius: number;
  sharp: number; // крутизна порога; 2.2 даёт край ≈1.5px
  waistReach: number; // до какого зазора перемычки делают каплю шире, px (0 — выкл)
  snapDuration: number; // длительность твина магнита/выпихивания, мс
  revealDuration: number; // длительность выезда/скрытия Pop и Float, мс
}

// GtkSnapshot.push_blur принимает «радиус» ≈ 3.2σ. Это калибровка GTK,
// не пользовательская настройка: σ задаётся meltRadius.
const GTK_BLUR_RADIUS_PER_SIGMA = 3.2;

/**
 * Поле «слизи» (alpha clipping): тела (рамка + окна) рисуются как есть, поверх —
 * те же тела и мостики между ними, пропущенные через размытие и порог по альфе.
 * Итог = чёткие тела ∪ слизь.
 *
 * Размытие и порог выполняет один узел Gsk (GPU). Геометрия мостиков дешёвая
 * и пересчитывается в JS на каждый снапшот — при перетаскивании это не заметно.
 *
 * Почему радиусы углов остаются точными:
 *  - Углы окон. Размытие скругляет выпуклые углы ВНУТРЬ тела, поэтому слизь лежит
 *    под чётким телом и не видна. Добавляется только материал снаружи: мостики
 *    между телами и вогнутые стыки.
 *  - Углы экрана. В слое слизи рамка рисуется тем же кольцом, что и чёткая
 *    (drawFrame), поэтому слизь идёт по всей кромке, включая дугу: мостик к углу
 *    вливается в материал рамки, а не висит отдельным комком. У вогнутой дуги
 *    blur немного заходит в комнату (~1.5 px при meltRadius = 10; тем больше,
 *    чем больше meltRadius), поэтому screenRadius должен совпадать с rounding
 *    из Hyprland: тогда сдвиг совпадает со скруглением композитора и незаметен.
 */
export const GooField = GObject.registerClass(
  { GTypeName: 'FrameGooField' },
  class GooField extends Gtk.Widget {
    cfg!: Reactive<FieldStyle>;
    rects: () => Rect[] = () => [];

    vfunc_snapshot(snap: Gtk.Snapshot) {
      const width = this.get_width();
      const height = this.get_height();
      if (width <= 0 || height <= 0) {
        return;
      }
      const {
        border,
        screenRadius,
        windowRadius,
        meltRadius,
        sharp,
        waistReach,
      } = snapshot(this.cfg);
      const sigma = sigmaOf(meltRadius);

      const cssColor = this.get_color(); // CSS: .frame-shape { color: ... }
      const solid = new Gdk.RGBA({
        red: cssColor.red,
        green: cssColor.green,
        blue: cssColor.blue,
        alpha: 1,
      });
      const rects = this.rects();

      // рамка уходит за экран, чтобы размытие не съело её край
      const margin = Math.ceil(sigma * 5) + 16;

      // Видимая рамка: кольцо точного радиуса (её и рисуем поверх слизи).
      const drawFrame = () => {
        const thickness = border + margin;
        const outline = new Gsk.RoundedRect().init_from_rect(
          new Graphene.Rect().init(
            -margin,
            -margin,
            width + 2 * margin,
            height + 2 * margin,
          ),
          screenRadius + thickness,
        );
        snap.append_border(
          outline,
          [thickness, thickness, thickness, thickness],
          [solid, solid, solid, solid],
        );
      };

      const drawWindows = () => {
        for (const rect of rects) {
          const bounds = new Graphene.Rect().init(
            rect.x,
            rect.y,
            rect.w,
            rect.h,
          );
          const rounded = new Gsk.RoundedRect().init_from_rect(
            bounds,
            Math.min(windowRadius, rect.w / 2, rect.h / 2),
          );
          snap.push_rounded_clip(rounded);
          snap.append_color(solid, bounds);
          snap.pop();
        }
      };

      /**
       * Капсула мостика: поворачиваем систему координат вокруг её центра,
       * рисуем скруглённый прямоугольник [-L/2, -W/2, L, W] и возвращаем координаты.
       * Радиус — min(L, W)/2: больше половины меньшей стороны Gsk не примет; при
       * малом зазоре L < W, и торец выходит скруглённым по длине мостика.
       */
      const drawBridges = (list: Bridge[]) => {
        for (const bridge of list) {
          snap.save();
          snap.transform(
            Gsk.Transform.new()
              .translate(
                new Graphene.Point().init(bridge.centerX, bridge.centerY),
              )!
              .rotate((bridge.angle * 180) / Math.PI)!,
          );
          const rect = new Graphene.Rect().init(
            -bridge.length / 2,
            -bridge.width / 2,
            bridge.length,
            bridge.width,
          );
          snap.push_rounded_clip(
            new Gsk.RoundedRect().init_from_rect(
              rect,
              Math.min(bridge.length, bridge.width) / 2,
            ),
          );
          snap.append_color(solid, rect);
          snap.pop();
          snap.restore();
        }
      };

      /**
       * Один слой слизи: тела размываются на sigmaLocal и проходят порог по альфе
       * α' = sharp·σ·(α − 0.5) + 0.5. Порог стоит ПОСЛЕ размытия, поэтому у прямой
       * кромки уровень α=0.5 остаётся ровно на кромке тела при любом σ: окна не
       * раздуваются, размытие только добавляет материал между телами.
       */
      const drawGoo = (sigmaLocal: number) => {
        const alphaGain = sharp * sigmaLocal;
        const matrix = new Graphene.Matrix().init_from_float([
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          alphaGain,
        ]);
        const offset = new Graphene.Vec4().init(0, 0, 0, 0.5 - 0.5 * alphaGain);
        snap.push_color_matrix(matrix, offset);
        snap.push_blur(sigmaLocal * GTK_BLUR_RADIUS_PER_SIGMA);
        // Рамка — тем же кольцом, что и в чётком слое: слизь идёт по дугам углов.
        drawFrame();
        drawWindows();
        // Мостики между близкими телами: капсула через зазор, размытие
        // превращает её в широкую каплю. Тело — прямоугольник окна с тем же
        // скруглением углов, что рисует drawWindows: у маленьких окон радиус
        // ограничен половиной стороны, иначе геометрия разошлась бы с пикселями.
        const bodies: Body[] = rects.map((rect) => ({
          ...rect,
          cornerRadius: Math.min(windowRadius, rect.w / 2, rect.h / 2),
        }));
        drawBridges(
          bridges(
            bodies,
            bridgeSpecFor(
              { w: width, h: height, border, screenRadius },
              { meltRadius, reach: waistReach },
            ),
          ),
        );
        snap.pop();
        snap.pop();
      };

      snap.push_opacity(cssColor.alpha);

      // 1. слизь: размытие + порог; рамка в ней — кольцом, как в чётком слое
      drawGoo(sigma);

      // 2. чёткие тела (точные радиусы) — всегда поверх слизи
      drawFrame();
      drawWindows();

      snap.pop(); // opacity
    }
  },
);
