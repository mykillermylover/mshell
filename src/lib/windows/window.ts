import type { Rect } from '@lib/geometry';
import type { Accessor, Setter } from 'ags';
import { createState } from 'ags';
import type { Gtk } from 'ags/gtk4';
import GLib from 'gi://GLib';

import {
  createWindowContent,
  padded,
  type WindowApi,
  type WindowHost,
  type WindowSpec,
} from './api';
import { HoverGate } from './HoverGate';

interface WindowOptions extends Pick<
  WindowSpec,
  'id' | 'content' | 'keyboard'
> {
  revealer: Gtk.Revealer;
  /** Whether the window participates in popover exclusivity. */
  exclusive?: boolean;
  /** Frame the window lives in. */
  host: WindowHost;
  /** The window opened: the host may apply exclusivity. */
  activate?(): void;
  /** Hover delays from the config; without them enter/leave do nothing. */
  delays?(): { open: number; hide: number };
}

/**
 * One window: open state, pin, hover timers and api for content.
 * Pop and Float add only layout and geometry.
 */
export abstract class Window {
  readonly id: string;
  readonly revealer: Gtk.Revealer;
  readonly api: WindowApi;
  /** Whether the window participates in popover exclusivity. */
  readonly exclusive: boolean;
  /** The window accepts input: hovering gives on-demand. */
  readonly keyboard: boolean;
  /** Content in its own scope; wrapped with padding, but not yet inserted into the window. */
  protected readonly contentWidget: Gtk.Box;

  private _pinned: Accessor<boolean>;
  private _setPinned: Setter<boolean>;
  private _keyboardGrabbed: Accessor<boolean>;
  private _setKeyboardGrabbed: Setter<boolean>;
  private hovering = false;
  private readonly gate: HoverGate | null;
  private readonly host: WindowHost;
  private readonly activate: (() => void) | undefined;
  private readonly delays: WindowOptions['delays'];
  private readonly disposeContent: () => void;

  protected constructor(options: WindowOptions) {
    this.id = options.id;
    this.revealer = options.revealer;
    this.exclusive = options.exclusive ?? false;
    this.keyboard = options.keyboard ?? false;
    this.host = options.host;
    this.activate = options.activate;
    this.delays = options.delays;

    [this._pinned, this._setPinned] = createState(false);
    [this._keyboardGrabbed, this._setKeyboardGrabbed] = createState(false);

    const delays = options.delays;
    this.gate = delays
      ? new HoverGate({
          open: () => this.open(),
          close: () => this.close(),
          isOpen: () => this.isOpen,
          schedule: (ms, run) => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
              run();
              return GLib.SOURCE_REMOVE;
            });
            return () => {
              GLib.source_remove(id);
            };
          },
        })
      : null;

    this.api = {
      id: options.id,
      monitor: options.host.monitor,
      pinned: this._pinned,
      togglePin: () => this.togglePin(),
      pin: () => this.pin(),
      unpin: () => this.unpin(),
      addFloat: (spec) => this.host.addFloat(spec),
      remove: (id) => this.host.remove(id),
      grabKeyboard: () => {
        this._setKeyboardGrabbed(true);
        this.host.exclusiveKeyboard(this.id, true);
      },
      releaseKeyboard: () => {
        this._setKeyboardGrabbed(false);
        this.host.unfocusKeyboard(this.id);
      },
      keyboardGrabbed: this._keyboardGrabbed,
    };

    const { content, dispose } = createWindowContent(this.api, () =>
      padded(options.content()),
    );
    this.contentWidget = content;
    this.disposeContent = dispose;
  }

  get pinned(): boolean {
    return this._pinned.peek();
  }

  set pinned(value: boolean) {
    this._setPinned(value);
  }

  get isOpen(): boolean {
    return this.revealer.reveal_child;
  }

  get animating(): boolean {
    return this.revealer.reveal_child !== this.revealer.child_revealed;
  }

  open() {
    this.gate?.cancel();
    this.revealer.reveal_child = true;
    this.activate?.();
  }

  close() {
    this.gate?.cancel();
    this.pinned = false;
    this.revealer.reveal_child = false;
    // A closed window does not hold the keyboard.
    this.api.releaseKeyboard();
  }

  /** Close if not pinned: this is how the host applies exclusivity. */
  dismiss() {
    if (!this.pinned) {
      this.close();
    }
  }

  enter() {
    if (this.keyboard) {
      this.host.hoverKeyboard(this.id, true);
    }
    if (this.pinned) {
      return;
    }
    if (this.delays) {
      this.gate?.enter(this.delays().open);
    }
  }

  leave() {
    if (this.keyboard) {
      this.host.hoverKeyboard(this.id, false);
    }
    if (this.pinned) {
      return;
    }
    if (this.delays) {
      this.gate?.leave(this.delays().hide);
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  pin() {
    this.pinned = true;
    this.open();
  }

  unpin() {
    this.pinned = false;
  }

  togglePin() {
    if (this.pinned) {
      this.unpin();
    } else {
      this.pin();
    }
  }

  /** Subscribe to window animations; the caller must keep the unsubscribe. */
  subscribe(fn: () => void): () => void {
    const targets = this.watchedRevealers();
    const ids = targets.map((target) => [
      target.connect('notify::reveal-child', fn),
      target.connect('notify::child-revealed', fn),
    ]);

    return () => {
      for (const [index, target] of targets.entries()) {
        for (const id of ids[index]) {
          target.disconnect(id);
        }
      }
    };
  }

  /**
   * Tab isolation: can_focus is cascading, so the content root is enough -
   * the focus chain does not go into neighboring windows.
   */
  setFocusable(value: boolean) {
    this.contentWidget.set_can_focus(value);
  }

  dispose() {
    this.gate?.cancel();
    this.disposeContent();
  }

  /**
   * Hover is computed from measure().input, not from child enter/leave:
   * empty children produce no events. Windows without input and without hover do not need it.
   */
  probe(x: number, y: number, relativeTo: Gtk.Widget): void {
    if (!this.acceptsHover) {
      return;
    }
    const rect = this.measure(relativeTo).input;
    const now =
      rect !== null &&
      x >= rect.x &&
      x < rect.x + rect.w &&
      y >= rect.y &&
      y < rect.y + rect.h;

    if (now === this.hovering) {
      return;
    }

    this.hovering = now;
    if (now) {
      this.enter();
    } else {
      this.leave();
    }
  }

  /** The cursor left the surface. */
  hoverOut(): void {
    if (this.hovering) {
      this.hovering = false;
      this.leave();
    }
  }

  /** Whether hover tracking is needed: hover zone or keyboard input. */
  protected get acceptsHover(): boolean {
    return this.keyboard;
  }

  /** Revealers whose animations move the shape; Pop adds the hover zone. */
  protected watchedRevealers(): Gtk.Revealer[] {
    return [this.revealer];
  }

  abstract measure(relativeTo: Gtk.Widget): WindowMeasure;
  abstract apply(): void;
}

/** Visible body and input area of the window; computed in one pass. */
export interface WindowMeasure {
  body: Rect | null;
  input: Rect | null;
}
