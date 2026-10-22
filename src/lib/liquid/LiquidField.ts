import { Gdk, Gtk } from 'ags/gtk4'; // первым: фиксирует Gtk 4 до загрузки Gsk
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import { register } from 'gnim/gobject';

import { type Reactive, snapshot } from '../config';
import { type Bridge, sigmaOf } from './bridges';
import type { Box } from './geometry';
import { buildScene } from './scene';

/** Прямоугольник в координатах поля: синоним Box из геометрии. */
export type Rect = Box;

export interface FieldStyle {
  border: number; // толщина рамки, px
  screenRadius: number; // радиус углов экрана, px (точный)
  windowRadius: number; // радиус углов окон, px (точный)
  // Радиус «кривой», которой жидкость соединяет тела (окно↔окно, окно↔рамка), px.
  // При таком зазоре между кромками они уже слипаются, а внутренний угол стыка
  // скругляется примерно этим радиусом — одно число задаёт и дальность, и кривизну.
  meltRadius: number;
  sharp: number; // крутизна порога; 2.2 даёт край ≈1.5px
  waistReach: number; // до какого зазора мостики делают каплю шире, px (0 — выкл)
  snapDuration: number; // длительность твина магнита/выпихивания, мс
  revealDuration: number; // длительность выезда/скрытия Pop и Float, мс
  hoverDepth: number; // толщина губы и input hover-зоны, px
  hoverDelay: number; // задержка открытия hover-попапа, мс
  hideDelay: number; // задержка закрытия после ухода, мс
}

// GtkSnapshot.push_blur принимает «радиус» ≈ 3.2σ. Это калибровка GTK,
// не пользовательская настройка: σ задаётся meltRadius.
const GTK_BLUR_RADIUS_PER_SIGMA = 3.2;
// Точка порога: 0.5 — ровно середина альфы, кромка тела остаётся на месте.
const ALPHA_MIDPOINT = 0.5;
// Рамка уходит за экран на 5σ + 16 px, чтобы blur не съел её видимый край.
const BLUR_MARGIN_SIGMAS = 5;
const FRAME_MARGIN_PX = 16;

/**
 * Поле «жидкости» (alpha clipping): тела (рамка + окна) рисуются как есть, поверх —
 * те же тела и мостики между ними, пропущенные через размытие и порог по альфе.
 * Итог = чёткие тела ∪ жидкость.
 *
 * Порог и размытие — два узла Gsk на GPU (цвет-матрица поверх blur).
 * Геометрия мостиков дешёвая и пересчитывается в JS на каждый снапшот —
 * при перетаскивании это не заметно.
 *
 * Почему радиусы углов остаются точными:
 *  - Углы окон. Размытие скругляет выпуклые углы ВНУТРЬ тела, поэтому жидкость лежит
 *    под чётким телом и не видна. Добавляется только материал снаружи: мостики
 *    между телами и вогнутые стыки.
 *  - Углы экрана. В слое жидкости рамка рисуется тем же кольцом, что и чёткая
 *    (drawFrame), поэтому жидкость идёт по всей кромке, включая дугу: мостик к углу
 *    вливается в материал рамки, а не висит отдельным комком. У вогнутой дуги
 *    blur немного заходит в комнату (~1.5 px при meltRadius = 10; тем больше,
 *    чем больше meltRadius), поэтому screenRadius должен совпадать с rounding
 *    из Hyprland: тогда сдвиг совпадает со скруглением композитора и незаметен.
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
    const scene = buildScene(
      rects,
      { w: width, h: height, border, screenRadius },
      { windowRadius, meltRadius, waistReach },
    );

    const margin = Math.ceil(sigma * BLUR_MARGIN_SIGMAS) + FRAME_MARGIN_PX;

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
      for (const body of scene.bodies) {
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
     * Один слой жидкости: тела размываются на sigmaLocal и проходят порог по альфе
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
      const offset = new Graphene.Vec4().init(
        0,
        0,
        0,
        ALPHA_MIDPOINT - ALPHA_MIDPOINT * alphaGain,
      );
      snap.push_color_matrix(matrix, offset);
      snap.push_blur(sigmaLocal * GTK_BLUR_RADIUS_PER_SIGMA);
      // Рамка — тем же кольцом, что и в чётком слое: жидкость идёт по дугам углов.
      drawFrame();
      drawWindows();
      // Мостики между близкими телами: капсула через зазор, размытие
      // превращает её в широкую каплю; радиусы тел уже зажаты в buildScene.
      drawBridges(scene.bridges);
      snap.pop();
      snap.pop();
    };

    snap.push_opacity(cssColor.alpha);

    // 1. жидкость: размытие + порог; рамка в ней — кольцом, как в чётком слое
    drawGoo(sigma);

    // 2. чёткие тела (точные радиусы) — всегда поверх жидкости
    drawFrame();
    drawWindows();

    snap.pop(); // opacity
  }
}
