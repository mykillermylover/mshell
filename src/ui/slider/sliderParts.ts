// Finding GtkScale's internal children.
//
// GtkRange builds its track out of private child widgets - `trough`,
// `highlight` and `slider` - and their real allocation is the only truthful
// source of geometry: the scale's own compute_bounds reports the overlay's
// box, not its track.
import type { Box } from '@lib/geometry';
import type { Gtk } from 'ags/gtk4';
import type Graphene from 'gi://Graphene';

/** CSS names of the parts GtkRange builds. */
export const TROUGH = 'trough';
export const HIGHLIGHT = 'highlight';
export const HANDLE = 'slider';

/** Depth-first search of a widget's children by CSS name. */
export function findPart(widget: Gtk.Widget, name: string): Gtk.Widget | null {
  for (let child = widget.get_first_child(); child;) {
    const sibling = child.get_next_sibling();

    if (child.get_css_name() === name) {
      return child;
    }
    const found = findPart(child, name);

    if (found) {
      return found;
    }
    child = sibling;
  }

  return null;
}

/** The three parts of the track, or `null` before the first allocation. */
export interface SliderParts {
  trough: Gtk.Widget;
  fill: Gtk.Widget;
  handle: Gtk.Widget;
}

export function findParts(slider: Gtk.Widget): SliderParts | null {
  const trough = findPart(slider, TROUGH);
  const fill = findPart(slider, HIGHLIGHT);
  const handle = findPart(slider, HANDLE);

  return trough && fill && handle ? { trough, fill, handle } : null;
}

/**
 * The parts of a slider, cached, re-checking a stale cache.
 *
 * GTK creates and destroys `highlight`/`fill` on its own (`has-origin`,
 * `show-fill-level`), so a cached widget can be gone; the cache is dropped
 * when that happens.
 *
 * The caller owns the cache - a private field - because a slider is the only
 * thing that knows when it is destroyed.
 */
export function currentParts(
  slider: Gtk.Widget,
  cache: SliderParts | null,
): SliderParts | null {
  if (cache && !cache.fill.in_destruction()) {
    return cache;
  }

  return findParts(slider);
}

/** The parts' real boxes in the slider's coordinates, or `null` before layout. */
export function partsBoxes(
  slider: Gtk.Widget,
  parts: SliderParts,
): { trough: Box; fill: Box; handle: Box } | null {
  const trough = parts.trough.compute_bounds(slider);
  const fill = parts.fill.compute_bounds(slider);
  const handle = parts.handle.compute_bounds(slider);

  if (!trough[0] || !fill[0] || !handle[0]) {
    return null;
  }

  return {
    trough: toBox(trough[1]),
    fill: toBox(fill[1]),
    handle: toBox(handle[1]),
  };
}

/** Graphene rect -> plain numbers, so the layout modules stay GTK-free. */
function toBox({ origin, size }: Graphene.Rect): Box {
  return { x: origin.x, y: origin.y, width: size.width, height: size.height };
}
