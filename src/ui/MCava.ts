// Cava visualizer: one widget draws the whole shape in its own snapshot.
//
// Not a Gtk.Box of N children: values arrive at the capture framerate (~60/s),
// and a height/CSS update per bar per frame is a style + layout pass per bar
// per frame. Here a frame is N rounded-color nodes (bars) or a single stroked
// path (curve) - the cheap Gsk ops LiquidField draws its windows with.

import type { Accessor } from 'ags';
import { Gtk } from 'ags/gtk4'; // first: pins Gtk 4 before Gsk is loaded
import type AstalCava from 'gi://AstalCava';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import { property, register } from 'gnim/gobject';

import {
  anchorPoint,
  anchorRect,
  type CavaAnchor,
  plotSize,
} from './cavaAnchor';
import { barRects } from './cavaBars';
import { curveSegments, polylinePoints } from './cavaCurve';

/**
 * bars - a row of columns;
 * 'wave-cubic' - a smooth spline through one point per value;
 * 'wave-line-to' - straight segments between the points: the sharp zigzag.
 */
export type CavaMode = 'bars' | 'wave-cubic' | 'wave-line-to';

export function isCavaMode(value: string): value is CavaMode {
  return ['bars', 'wave-cubic', 'wave-line-to'].includes(value);
}

export interface MCavaProps extends Partial<Gtk.Widget.ConstructorProps> {
  /** The capture to visualize: `AstalCava.get_default()`. */
  cava: AstalCava.Cava;
  mode?: CavaMode | Accessor<CavaMode>;
  /** Space between bars, px (bars only). */
  gap?: number;
  /**
   * Height of a silent bar, px (bars only): a visible floor instead of an
   * empty row. `0` (default) draws nothing for silence.
   */
  minBarHeight?: number;
  rectRadius?: number;
  /** Line thickness of a wave, px. */
  lineWidth?: number;
  /**
   * Where the baseline sits: `bottom` (default) - along x, growing up;
   * `top` - along x, growing down; `left` - along y, growing right;
   * `right` - along y, growing left.
   */
  anchor?: CavaAnchor;
  /**
   * Wave multiplier ('wave-cubic' only): every span bows toward zero at its
   * middle by the mean level of its two points times `sag`. `0` - a straight
   * spline, `1` - a loud span bows by half its height. Loud waves more,
   * silence stays flat.
   */
  sag?: number;
}

const DEFAULT_GAP = 2;
const DEFAULT_LINE_WIDTH = 2;

/**
 * Visualizer of an AstalCava capture, coloured by CSS `color`:
 * `.cava { color: var(--primary); }`. Size it with widthRequest /
 * heightRequest (or hexpand/vexpand).
 *
 * The wave modes draw one invisible point per value, only the line moves.
 * They keep the line off the edges by half the line width, so a full level
 * never clips. `wave-cubic` is a Catmull-Rom spline (`sag` scales the bow of
 * each span, toward zero, by the level of its points);
 * `wave-line-to` connects the points with straight lines - sharp peaks.
 */
@register({ GTypeName: 'MCava' })
export class MCava extends Gtk.Widget {
  @property(String)
  mode: CavaMode = 'bars';

  readonly #cava: AstalCava.Cava;
  readonly #gap: number;
  readonly #minBarHeight: number;
  readonly #rectRadius: number;
  readonly #lineWidth: number;
  readonly #sag: number;
  readonly #anchor: CavaAnchor;

  constructor(props: MCavaProps) {
    const {
      cava,
      gap = DEFAULT_GAP,
      minBarHeight = 0,
      rectRadius = 0,
      lineWidth = DEFAULT_LINE_WIDTH,
      sag = 0,
      anchor = 'bottom',
      ...rest
    } = props;
    super(rest);

    this.#cava = cava;
    this.#gap = gap;
    this.#minBarHeight = minBarHeight;
    this.#rectRadius = rectRadius;
    this.#lineWidth = lineWidth;
    this.#sag = sag;
    this.#anchor = anchor;

    // Values mutate in place and are announced by the signal, so a redraw is
    // the whole consumption. The capture is a process-wide singleton, so the
    // handler outlives the widget unless it is dropped on destroy (windows can
    // be removed and rebuilt at runtime).
    const id = cava.connect('notify::values', () => this.queue_draw());
    this.connect('destroy', () => cava.disconnect(id));
    // Redraw on reactive mode change
    this.connect('notify::mode', () => this.queue_draw());
  }

  vfunc_snapshot(snap: Gtk.Snapshot) {
    const width = this.get_width();
    const height = this.get_height();
    if (width <= 0 || height <= 0) {
      return;
    }

    const values = this.#cava.get_values();
    const color = this.get_color();
    // The geometry always works in the shape frame: along its width, growing
    // up from the bottom. Anchors place that frame in the widget.
    const { along, across } = plotSize(this.#anchor, width, height);

    switch (this.mode) {
      case 'wave-cubic': {
        this.#drawWave(snap, color, this.#cubicPath(values, along, across));
        break;
      }
      case 'wave-line-to': {
        this.#drawWave(snap, color, this.#polylinePath(values, along, across));
        break;
      }
      default: {
        this.#drawBars(snap, values, along, across, width, height, color);
      }
    }
  }

  #drawBars(
    snap: Gtk.Snapshot,
    values: number[],
    along: number,
    across: number,
    width: number,
    height: number,
    color: ReturnType<Gtk.Widget['get_color']>,
  ) {
    for (const bar of barRects(
      values,
      along,
      across,
      this.#gap,
      this.#minBarHeight,
    )) {
      const { x, y, w, h } = anchorRect(this.#anchor, bar, width, height);
      const rect = new Graphene.Rect().init(x, y, w, h);
      snap.push_rounded_clip(
        new Gsk.RoundedRect().init_from_rect(rect, this.#rectRadius),
      );
      snap.append_color(color, rect);
      snap.pop();
    }
  }

  /** Catmull-Rom spline: one cubic per half of a span. */
  #cubicPath(values: number[], along: number, across: number) {
    const segments = curveSegments(values, along, across, this.#lineWidth / 2, {
      sag: this.#sag,
    });
    if (segments.length === 0) {
      return null;
    }

    const path = new Gsk.PathBuilder();
    const start = this.#place(segments[0].x1, segments[0].y1);
    path.move_to(start.x, start.y);
    for (const s of segments) {
      const c1 = this.#place(s.cx1, s.cy1);
      const c2 = this.#place(s.cx2, s.cy2);
      const end = this.#place(s.x2, s.y2);
      path.cubic_to(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }
    return path;
  }

  /** Straight segments between the points: the sharp zigzag. */
  #polylinePath(values: number[], along: number, across: number) {
    const points = polylinePoints(values, along, across, this.#lineWidth / 2);
    if (points.length === 0) {
      return null;
    }

    const path = new Gsk.PathBuilder();
    const start = this.#place(points[0].x, points[0].y);
    path.move_to(start.x, start.y);
    for (const point of points.slice(1)) {
      const placed = this.#place(point.x, point.y);
      path.line_to(placed.x, placed.y);
    }
    return path;
  }

  /** A point of the shape frame (along the values, y from its top) in the widget. */
  #place(along: number, y: number) {
    return anchorPoint(
      this.#anchor,
      along,
      y,
      this.get_width(),
      this.get_height(),
    );
  }

  #drawWave(
    snap: Gtk.Snapshot,
    color: ReturnType<Gtk.Widget['get_color']>,
    path: Gsk.PathBuilder | null,
  ) {
    if (!path) {
      return;
    }

    // One path for the whole line: a single stroke node per frame, unlike a
    // bar per value. Round caps keep a lone point from vanishing.
    const stroke = new Gsk.Stroke(this.#lineWidth);
    stroke.set_line_cap(Gsk.LineCap.ROUND);
    stroke.set_line_join(Gsk.LineJoin.ROUND);

    snap.append_stroke(path.to_path(), stroke, color);
  }
}
