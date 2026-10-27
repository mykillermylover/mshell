// The contract between a window and its frame: what content may ask for and what
// the frame must provide. No widget construction here.
import type { Accessor } from 'ags';
import { createContext } from 'ags';
import type { Gdk } from 'ags/gtk4';

import type { FloatSpec } from './spec';

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
  /** Whether the window is open */
  readonly opened: Accessor<boolean>;
  /** Whether the window has hover */
  readonly hovered: Accessor<boolean>;
  open(): void;
  close(): void;
  toggle(): void;
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
export const WindowContext = createContext<WindowApi | null>(null);

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
