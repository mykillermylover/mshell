// Key handlers of a window: pure logic, no GJS, so the dispatch is tested in
// node. The frame's key controller finds the keyboard owner and asks it to
// dispatch; everything GTK lives outside this file.

/** What the handler gets: the raw GDK fields, no GTK types. */
export interface KeyEvent {
  keyval: number;
  keycode: number;
  state: number;
}

/** `true` - handled: the key must not reach the widgets inside the window. */
export type KeyHandler = (event: KeyEvent) => boolean | void;

/**
 * Run the handlers in order until one handles the key.
 * A handler returning anything but `true` passes the key on; the chain stops
 * at the first `true`, so later handlers do not see the key at all.
 */
export function dispatchKey(
  handlers: readonly KeyHandler[],
  event: KeyEvent,
): boolean {
  for (const handler of handlers) {
    if (handler(event) === true) {
      return true;
    }
  }
  return false;
}

/** Ordered set of handlers with removal; order is registration order. */
export class KeyHandlers {
  readonly #handlers = new Map<symbol, KeyHandler>();

  /** Register a handler; returns the function that removes it. */
  add(handler: KeyHandler): () => void {
    const token = Symbol('key-handler');
    this.#handlers.set(token, handler);

    return () => {
      this.#handlers.delete(token);
    };
  }

  dispatch(event: KeyEvent): boolean {
    return dispatchKey([...this.#handlers.values()], event);
  }

  get size(): number {
    return this.#handlers.size;
  }
}
