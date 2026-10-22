import type { Accessor, Setter } from 'ags';
import { createRoot, createState } from 'ags';
import type { Gtk } from 'ags/gtk4';
import { timeout, type Timer } from 'ags/time';

import type { Rect } from '../liquid/LiquidField';
import { type WindowApi, WindowContext } from './api';
import { HoverGate } from './hoverGate';
import { type Content, padded } from './ui';

export interface WindowOptions {
  id: string;
  content: Content;
  revealer: Gtk.Revealer;
  /** Окно открылось: хост может применить эксклюзивность. */
  activate?(): void;
  /** Задержки hover из конфига; без них enter/leave ничего не делают. */
  delays?(): { open: number; hide: number };
}

const noop = () => {};

/**
 * Одно окно: открытость, pin, hover-таймеры и api для контента.
 * Pop и Float добавляют только раскладку и геометрию.
 */
export abstract class Window {
  readonly id: string;
  readonly revealer: Gtk.Revealer;
  readonly api: WindowApi;
  /** Контент в своём scope; обёрнут отступами, но ещё не вставлен в окно. */
  protected readonly contentWidget: Gtk.Box;

  private _pinned: Accessor<boolean>;
  private _setPinned: Setter<boolean>;
  private readonly gate: HoverGate | null;
  private readonly activate: (() => void) | undefined;
  private readonly delays: WindowOptions['delays'];
  private readonly disposeContent: () => void;

  protected constructor(options: WindowOptions) {
    this.id = options.id;
    this.revealer = options.revealer;
    this.activate = options.activate;
    this.delays = options.delays;

    [this._pinned, this._setPinned] = createState(false);

    const delays = options.delays;
    this.gate = delays
      ? new HoverGate({
          open: () => this.open(),
          close: () => this.close(),
          isOpen: () => this.isOpen,
          isPinned: () => this.isPinned,
          setPinned: (value) => {
            this.pinned = value;
          },
          schedule: (ms, run) => {
            const timer: Timer = timeout(ms, run);
            return () => timer.cancel();
          },
        })
      : null;

    this.api = {
      id: options.id,
      pinned: this._pinned,
      pin: () => this.pin(),
      unpin: () => this.unpin(),
      togglePin: () => this.togglePin(),
      open: () => this.open(),
      close: () => this.close(),
      toggle: () => (this.isOpen ? this.close() : this.open()),
    };

    let dispose = noop;
    this.contentWidget = createRoot((rootDispose) => {
      dispose = rootDispose;
      return WindowContext.provide(this.api, () => padded(options.content()));
    });
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

  get isPinned(): boolean {
    return this.pinned;
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
  }

  /** Закрыться, если не закреплено: так хост применяет эксклюзивность. */
  dismiss() {
    if (!this.isPinned) {
      this.close();
    }
  }

  enter() {
    if (this.delays) {
      this.gate?.enter(this.delays().open);
    }
  }

  leave() {
    if (this.delays) {
      this.gate?.leave(this.delays().hide);
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
    if (this.isPinned) {
      this.unpin();
    } else {
      this.pin();
    }
  }

  subscribe(fn: () => void): () => void {
    const ids = [
      this.revealer.connect('notify::reveal-child', fn),
      this.revealer.connect('notify::child-revealed', fn),
    ];
    return () => {
      for (const id of ids) {
        this.revealer.disconnect(id);
      }
    };
  }

  dispose() {
    this.gate?.cancel();
    this.disposeContent();
  }

  abstract bounds(relativeTo: Gtk.Widget): Rect | null;
  abstract inputBounds(relativeTo: Gtk.Widget): Rect | null;
  abstract apply(): void;
}
