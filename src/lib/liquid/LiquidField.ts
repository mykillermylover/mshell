import type { FieldStyle } from '@lib/config';
import { type Body, clampRadius, type Rect } from '@lib/geometry';
import { Gdk, Gtk } from 'ags/gtk4'; // first: pins Gtk 4 before Gsk is loaded
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import { register } from 'gnim/gobject';

import { type Bridge, bridges, bridgeShape, bridgeSpecFor } from './bridges';

// GtkSnapshot.push_blur takes a radius, and GTK computes σ = radius / 2 inside
// (gsk/gpu/shaders/gskgpublur.glsl). So to get a given σ,
// the radius must be 2σ. This is GTK calibration, not a user setting.
const GTK_BLUR_RADIUS_PER_SIGMA = 2;
// Threshold point: 0.5 - exactly the alpha midpoint, the body edge stays in place.
const ALPHA_MIDPOINT = 0.5;
// The frame goes off-screen by 5σ + 16 px so the blur does not eat its visible edge.
const BLUR_MARGIN_SIGMAS = 5;
const FRAME_MARGIN_PX = 16;
// σ from blurRadius: the blur is a "bell", 1.35 is the previous edge-weld calibration.
const SIGMA_PER_MELT = 1 / 1.35;
const MIN_SIGMA = 1;

/**
 * "Liquid" field (alpha clipping): the frame and windows are drawn as is, and on top -
 * the same bodies passed through blur and an alpha threshold.
 * Result = sharp bodies ∪ blurred field.
 *
 * Threshold and blur are two Gsk nodes on the GPU (color matrix over blur).
 *
 * Why corner radii stay exact:
 *  - Window corners. The blur rounds convex corners INTO the body, so the liquid
 *    lies under the sharp body and is not visible.
 *  - Screen corners. In the liquid layer the frame is drawn with the same ring as the sharp
 *    one (drawFrame), so the blur goes along the whole edge, including the arc. On a concave
 *    arc the blur goes slightly into the interior (~1.5 px at blurRadius = 10; the more
 *    the larger blurRadius), so screenRadius must match
 *    the rounding from Hyprland: then the shift matches the compositor rounding
 *    and is unnoticeable.
 */
@register({ GTypeName: 'FrameLiquidField' })
export class LiquidField extends Gtk.Widget {
  private style: (() => FieldStyle) | null = null;
  rects: () => Rect[] = () => [];

  /** The style is passed as a getter: the snapshot is taken at draw time. */
  configure(style: () => FieldStyle) {
    this.style = style;
  }

  vfunc_snapshot(snap: Gtk.Snapshot) {
    const width = this.get_width();
    const height = this.get_height();
    if (!this.style || width <= 0 || height <= 0) {
      return;
    }
    const { border, screenRadius, windowRadius, blurRadius, snapReach, sharp } =
      this.style();
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

    // Bridges — the same reach as the magnet: the liquid appears where
    // the window would be attracted, and stretches as a thin neck rather than a wide blur weld.
    const liquidBridges = bridges(
      bodies,
      bridgeSpecFor(
        { w: width, h: height, border, screenRadius },
        { sigma, reach: snapReach },
      ),
    );

    // Visible frame: a ring of exact radius (we draw it over the liquid).
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
     * Axis-aligned bridge — a rounded plate without rotation (fast rounded-color op);
     * diagonal — a stroke with round end caps, one node without transform/clip.
     * No rotated rounded clips: in Gsk they may cost an extra offscreen.
     */
    const drawBridges = (list: Bridge[]) => {
      for (const bridge of list) {
        const shape = bridgeShape(bridge);
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
     * One liquid layer: bodies are blurred at sigmaLocal and pass the
     * alpha threshold α' = sharp·σ·(α − 0.5) + 0.5. The threshold is AFTER the blur, so
     * on a straight edge the α=0.5 level stays exactly on the body edge for any σ:
     * windows do not inflate, the blur only softens the edges.
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
      // Frame - with the same ring as in the sharp layer: the liquid follows the arcs.
      drawFrame();
      drawWindows();
      drawBridges(liquidBridges);
      snap.pop();
      snap.pop();
    };

    snap.push_opacity(cssColor.alpha);

    // 1. liquid: blur + threshold
    drawLiquid(sigma);

    // 2. sharp bodies (exact radii) - always over the liquid
    drawFrame();
    drawWindows();

    snap.pop(); // opacity
  }
}
