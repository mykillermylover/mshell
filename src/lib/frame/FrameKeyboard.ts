// Keyboard arbitration for one frame: pure logic without GJS. The surface
// keymode and the per-window focusability are injected, so the transitions
// are tested in node without GTK.
export type KeyboardMode = 'none' | 'on-demand' | 'exclusive';

interface FrameKeyboardDeps {
  /** The surface takes the keyboard this way. */
  keymode(mode: KeyboardMode): void;
  /** Only this window stays focusable; `null` - none. */
  focus(owner: string | null): void;
}

/**
 * Two kinds of grab on one surface: on-demand follows the hovered window,
 * exclusive is taken forcefully by a modal and overrides hover.
 * Hover does not override an exclusive grab; releasing it gives on-demand
 * back to the window under the cursor.
 */
export class FrameKeyboard {
  #exclusiveOwner: string | null = null;
  #hoverOwner: string | null = null;

  readonly #deps: FrameKeyboardDeps;

  constructor(deps: FrameKeyboardDeps) {
    this.#deps = deps;
  }

  /**
   * The window the keyboard belongs to right now: an exclusive grab wins over
   * hover, and `null` means the surface does not hold the keyboard at all.
   */
  get owner(): string | null {
    return this.#exclusiveOwner ?? this.#hoverOwner;
  }

  hover(owner: string, entering: boolean) {
    if (entering) {
      if (this.#exclusiveOwner !== null || this.#hoverOwner === owner) {
        return;
      }
      this.#hoverOwner = owner;
      this.#deps.keymode('on-demand');
      this.#deps.focus(owner);
      return;
    }

    // The one leaving is not the current owner - another window has already taken it over.
    if (this.#hoverOwner !== owner) {
      return;
    }
    this.#hoverOwner = null;
    if (this.#exclusiveOwner !== null) {
      return;
    }
    this.#deps.keymode('none');
    this.#deps.focus(null);
  }

  exclusive(owner: string, active: boolean) {
    if (active) {
      this.#exclusiveOwner = owner;
      this.#deps.keymode('exclusive');
      this.#deps.focus(owner);
      return;
    }

    if (this.#exclusiveOwner !== owner) {
      return;
    }
    this.#exclusiveOwner = null;
    // A hovered window may have remained under the modal - give it back on-demand.
    if (this.#hoverOwner !== null) {
      this.#deps.keymode('on-demand');
      this.#deps.focus(this.#hoverOwner);
      return;
    }
    this.#deps.keymode('none');
    this.#deps.focus(null);
  }

  /**
   * Window close: release both kinds of grab, without touching others.
   * The hover is dropped first: otherwise releasing the exclusive grab would hand
   * on-demand back to the closing window for the duration of one call.
   */
  unfocus(owner: string) {
    this.hover(owner, false);
    this.exclusive(owner, false);
  }
}
