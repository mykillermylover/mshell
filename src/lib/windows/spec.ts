// Window definitions: only types, no GJS. Loaded by node tests and by the
// window list in src/windows.tsx.
import type { EdgeAlign, HorizontalEdge, VerticalEdge } from './popLayout';

/** Window content - what the JSX component returns. */
export type Content = () => JSX.Element;

/** Popover hover zone settings. */
export interface HoverSpec {
  content?: Content; // component inside the zone
  hideOnReveal?: boolean; // hide the zone while the popover is revealed
  /** Keep the lip's strip clear in the compositor; popups never change it. */
  reserve?: boolean;
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

/** Floating window: dragged by its header, snaps to the frame and merges with it. */
export interface FloatSpec extends WindowSpec {
  /** Header - the drag handle; any widget. Built in the window scope, so `useWindowApi` works. */
  header: Content;
  x: number;
  y: number;
}
