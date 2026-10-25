import type { Rect } from '@lib/geometry';
import { noop } from '@lib/utils';
import type { Accessor } from 'ags';
import { createContext, createRoot } from 'ags';
import type { Gdk } from 'ags/gtk4';
import { Gtk } from 'ags/gtk4';

import type { EdgeAlign, HorizontalEdge, VerticalEdge } from './popLayout';

/** Window content - what the JSX component returns. */
export type Content = () => JSX.Element;

/** Popover hover zone settings. */
export interface HoverSpec {
  content?: Content; // component inside the zone
  hideOnReveal?: boolean; // hide the zone while the popover is revealed
}

/** Common to all windows: content and keyboard. */
export interface WindowSpec {
  id: string;
  content: Content; // called once per monitor; do NOT set a background
  /** The window accepts keyboard input: hovering gives on-demand. */
  keyboard?: boolean;
}

interface PopBase extends WindowSpec {
  align?: EdgeAlign; // position along the edge
  hover?: true | HoverSpec; // true - default values; absent - no hover
  openByDefault?: boolean;
  exclusive?: boolean;
}

type VerticalPopSpec = PopBase & { edge: VerticalEdge; offsetY?: number };
type HorizontalPopSpec = PopBase & { edge: HorizontalEdge; offsetX?: number };

export function isVerticalEdge(spec: PopSpec): spec is VerticalPopSpec {
  return spec.edge === 'left' || spec.edge === 'right';
}

/**
 * Window that slides out of the frame edge (opens/closes).
 * Shift along the edge is typed by side: for top/bottom - offsetX,
 * for left/right - offsetY. Positive value - right/down.
 */
export type PopSpec = HorizontalPopSpec | VerticalPopSpec;

/** Floating window: dragged by its title, snaps to the frame and merges with it. */
export interface FloatSpec extends WindowSpec {
  title?: string;
  x: number;
  y: number;
}

/**
 * Capabilities of a specific window available to its content. This is the handle
 * of the window and its frame, not the Shell: other monitors and Frame internals are inaccessible.
 */
export interface WindowApi {
  /** Window identifier from its spec. */
  readonly id: string;
  /** Monitor the window lives on. */
  readonly monitor: Gdk.Monitor;
  /** Whether the window is pinned - reactive, for UI. */
  readonly pinned: Accessor<boolean>;
  togglePin(): void;
  pin(): void;
  unpin(): void;
  /** Create a Float in the same frame/on the same monitor. */
  addFloat(spec: FloatSpec): void;
  /** Remove a window (by id) from this frame. */
  remove(id: string): void;
  /**
   * Forcefully take the keyboard for the whole frame (EXCLUSIVE):
   * held until `releaseKeyboard` is called or the window is closed.
   * Automatic on-demand on hover is provided by the `keyboard` prop.
   */
  grabKeyboard(): void;
  /** Return the keyboard to the compositor. */
  releaseKeyboard(): void;
  /** Whether this window takes the keyboard forcefully. */
  readonly keyboardGrabbed: Accessor<boolean>;
}

/** Narrow host that Frame gives to the window: without a reference to Frame itself. */
export interface WindowHost {
  readonly monitor: Gdk.Monitor;
  addFloat(spec: FloatSpec): void;
  remove(id: string): void;
  /** Hovering over the window: on-demand on enter, NONE on leave. */
  hoverKeyboard(owner: string, entering: boolean): void;
  /** Modal keyboard grab: EXCLUSIVE until released. */
  exclusiveKeyboard(owner: string, active: boolean): void;
  /** Clear both on-demand and exclusive for this window (window close). */
  unfocusKeyboard(owner: string): void;
  /** Tab isolation: only this window remains focusable. */
  isolateFocus(owner: string | null): void;
}

/** Window context: Window provides it to its content, the hook reads it. */
const WindowContext = createContext<WindowApi | null>(null);

/**
 * API of the window whose content called the hook. Call at the start of the component
 * (like useContext); in handlers use the object already obtained.
 */
export function useWindowApi(): WindowApi {
  const api = WindowContext.use();
  if (!api) {
    throw new Error('useWindowApi(): content created outside a window');
  }
  return api;
}

/**
 * Build window content in a separate scope with its api. Used for both
 * the main content and the hover zone: both must live and die with the window.
 */
export function createWindowContent<T>(
  api: WindowApi,
  build: () => T,
): { content: T; dispose: () => void } {
  let dispose = noop;
  const content = createRoot((rootDispose) => {
    dispose = rootDispose;
    return WindowContext.provide(api, build);
  });
  return { content, dispose };
}

/** gnim types the JSX result as GObject.Object; in fact it is Gtk.Widget. */
export function asWidget(child: JSX.Element): Gtk.Widget {
  return child as Gtk.Widget;
}

/** Window content wrapper: padding and transparent background (background is drawn by LiquidField). */
export function padded(child: JSX.Element): Gtk.Box {
  const body = new Gtk.Box();
  body.add_css_class('frame-body');
  body.append(asWidget(child));
  return body;
}

/** Window body bounds; null if it is not laid out yet. */
export function boundsOf(
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null {
  const [ok, bounds] = widget.compute_bounds(relativeTo);
  if (!ok || bounds.get_width() < 1 || bounds.get_height() < 1) {
    return null;
  }
  return {
    x: bounds.get_x(),
    y: bounds.get_y(),
    w: bounds.get_width(),
    h: bounds.get_height(),
  };
}
