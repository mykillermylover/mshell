import { type FieldStyle, type Reactive, snapshot } from '@lib/config';
import { Gdk, Gtk } from 'ags/gtk4'; // первым: фиксирует Gtk 4 до загрузки Gsk
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import { register } from 'gnim/gobject';

import { type Bridge, bridges, bridgeShape, bridgeSpecFor } from './bridges';
import { type Body, clampRadius, type Rect } from './geometry';

// GtkSnapshot.push_blur принимает радиус, а GTK считает внутри σ = radius / 2
// (gsk/gpu/shaders/gskgpublur.glsl). Значит, чтобы получить заданную σ,
// радиус должен быть 2σ. Это калибровка GTK, не пользовательская настройка.
const GTK_BLUR_RADIUS_PER_SIGMA = 2;
// Точка порога: 0.5 - ровно середина альфы, кромка тела остаётся на месте.
const ALPHA_MIDPOINT = 0.5;
// Рамка уходит за экран на 5σ + 16 px, чтобы blur не съел её видимый край.
const BLUR_MARGIN_SIGMAS = 5;
const FRAME_MARGIN_PX = 16;
// σ из blurRadius: размытие - «колокол», 1.35 - прежняя калибровка слияния кромок.
const SIGMA_PER_MELT = 1 / 1.35;
const MIN_SIGMA = 1;

/**
 * Поле «жидкости» (alpha clipping): рамка и окна рисуются как есть, поверх -
 * те же тела, пропущенные через размытие и порог по альфе.
 * Итог = чёткие тела ∪ размытое поле.
 *
 * Порог и размытие - два узла Gsk на GPU (цвет-матрица поверх blur).
 *
 * Почему радиусы углов остаются точными:
 *  - Углы окон. Размытие скругляет выпуклые углы ВНУТРЬ тела, поэтому жидкость
 *    лежит под чётким телом и не видна.
 *  - Углы экрана. В слое жидкости рамка рисуется тем же кольцом, что и чёткая
 *    (drawFrame), поэтому blur идёт по всей кромке, включая дугу. У вогнутой
 *    дуги blur немного заходит в комнату (~1.5 px при blurRadius = 10; тем
 *    больше, чем больше blurRadius), поэтому screenRadius должен совпадать
 *    с rounding из Hyprland: тогда сдвиг совпадает со скруглением композитора
 *    и незаметен.
 */
@register({ GTypeName: 'FrameLiquidField' })
export class LiquidField extends Gtk.Widget {
  cfg!: Reactive<FieldStyle>;
  rects: () => Rect[] = () => [];

  vfunc_snapshot(snap: Gtk.Snapshot) {
    const width = this.get_width();
    const height = this.get_height();
    if (width <= 0 || height <= 0) {
      return;
    }
    const { border, screenRadius, windowRadius, blurRadius, snapReach, sharp } =
      snapshot(this.cfg);
    const sigma = Math.max(MIN_SIGMA, blurRadius * SIGMA_PER_MELT);

    const cssColor = this.get_color(); // CSS: .frame-shape { color: ... }
    const solid = new Gdk.RGBA({
      red: cssColor.red,
      green: cssColor.green,
      blue: cssColor.blue,
      alpha: 1,
    });
    const bodies: Body[] = this.rects().map((rect) => {
      const body = { ...rect, cornerRadius: windowRadius };
      return { ...body, cornerRadius: clampRadius(body) };
    });

    const margin = Math.ceil(sigma * BLUR_MARGIN_SIGMAS) + FRAME_MARGIN_PX;

    // Мостики — та же дальность, что у магнита: жидкость появляется там,
    // где окно притянется, и тянется тонкой шейкой, а не широкой сваркой blur.
    const liquidBridges = bridges(
      bodies,
      bridgeSpecFor(
        { w: width, h: height, border, screenRadius },
        { sigma, reach: snapReach },
      ),
    );

    // Видимая рамка: кольцо точного радиуса (её и рисуем поверх жидкости).
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
      for (const body of bodies) {
        const bounds = new Graphene.Rect().init(body.x, body.y, body.w, body.h);
        const rounded = new Gsk.RoundedRect().init_from_rect(
          bounds,
          body.cornerRadius,
        );
        snap.push_rounded_clip(rounded);
        snap.append_color(solid, bounds);
        snap.pop();
      }
    };

    /**
     * Осевой мостик — скруглённая плашка без поворота (быстрый rounded-color op);
     * диагональный — штрих с круглыми торцами, один узел без transform/clip.
     * Никаких повёрнутых rounded clip: в Gsk они могут стоить лишний offscreen.
     */
    const drawBridges = (list: Bridge[]) => {
      for (const bridge of list) {
        const shape = bridgeShape(bridge);
        if (!shape) {
          continue;
        }
        if (shape.kind === 'rect') {
          const rect = new Graphene.Rect().init(
            shape.x,
            shape.y,
            shape.w,
            shape.h,
          );
          snap.push_rounded_clip(
            new Gsk.RoundedRect().init_from_rect(rect, shape.radius),
          );
          snap.append_color(solid, rect);
          snap.pop();
          continue;
        }
        const path = new Gsk.PathBuilder();
        path.move_to(shape.x1, shape.y1);
        path.line_to(shape.x2, shape.y2);
        const stroke = new Gsk.Stroke(shape.width);
        stroke.set_line_cap(Gsk.LineCap.ROUND);
        snap.append_stroke(path.to_path(), stroke, solid);
      }
    };

    /**
     * Один слой жидкости: тела размываются на sigmaLocal и проходят порог по
     * альфе α' = sharp·σ·(α − 0.5) + 0.5. Порог стоит ПОСЛЕ размытия, поэтому
     * у прямой кромки уровень α=0.5 остаётся ровно на кромке тела при любом σ:
     * окна не раздуваются, размытие только смягчает края.
     */
    const drawLiquid = (sigmaLocal: number) => {
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
      const offset = new Graphene.Vec4().init(
        0,
        0,
        0,
        ALPHA_MIDPOINT - ALPHA_MIDPOINT * alphaGain,
      );
      snap.push_color_matrix(matrix, offset);
      snap.push_blur(sigmaLocal * GTK_BLUR_RADIUS_PER_SIGMA);
      // Рамка - тем же кольцом, что и в чётком слое: жидкость идёт по дугам.
      drawFrame();
      drawWindows();
      drawBridges(liquidBridges);
      snap.pop();
      snap.pop();
    };

    snap.push_opacity(cssColor.alpha);

    // 1. жидкость: размытие + порог
    drawLiquid(sigma);

    // 2. чёткие тела (точные радиусы) - всегда поверх жидкости
    drawFrame();
    drawWindows();

    snap.pop(); // opacity
  }
}
