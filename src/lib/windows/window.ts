import type { Rect } from '@lib/geometry';
import type { Accessor, Setter } from 'ags';
import { createState } from 'ags';
import type { Gtk } from 'ags/gtk4';
import GLib from 'gi://GLib';

import {
  type Content,
  createWindowContent,
  padded,
  type WindowApi,
  type WindowHost,
} from './api';
import { HoverGate } from './HoverGate';

interface WindowOptions {
  id: string;
  content: Content;
  revealer: Gtk.Revealer;
  /** Участвует ли окно в эксклюзивности попапов. */
  exclusive?: boolean;
  /** Кадр, в котором живёт окно. */
  host: WindowHost;
  /** Окно открылось: хост может применить эксклюзивность. */
  activate?(): void;
  /** Задержки hover из конфига; без них enter/leave ничего не делают. */
  delays?(): { open: number; hide: number };
}

/**
 * Одно окно: открытость, pin, hover-таймеры и api для контента.
 * Pop и Float добавляют только раскладку и геометрию.
 */
export abstract class Window {
  readonly id: string;
  readonly revealer: Gtk.Revealer;
  readonly api: WindowApi;
  /** Участвует ли окно в эксклюзивности попапов. */
  readonly exclusive: boolean;
  /** Контент в своём scope; обёрнут отступами, но ещё не вставлен в окно. */
  protected readonly contentWidget: Gtk.Box;

  private _pinned: Accessor<boolean>;
  private _setPinned: Setter<boolean>;
  private readonly gate: HoverGate | null;
  private readonly host: WindowHost;
  private readonly activate: (() => void) | undefined;
  private readonly delays: WindowOptions['delays'];
  private readonly disposeContent: () => void;

  protected constructor(options: WindowOptions) {
    this.id = options.id;
    this.revealer = options.revealer;
    this.exclusive = options.exclusive ?? false;
    this.host = options.host;
    this.activate = options.activate;
    this.delays = options.delays;

    [this._pinned, this._setPinned] = createState(false);

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
      addFloat: (spec) => this.host.addFloat(spec),
      remove: (id) => this.host.remove(id),
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
  }

  /** Закрыться, если не закреплено: так хост применяет эксклюзивность. */
  dismiss() {
    if (!this.pinned) {
      this.close();
    }
  }

  enter() {
    if (this.pinned) {
      return;
    }
    if (this.delays) {
      this.gate?.enter(this.delays().open);
    }
  }

  leave() {
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

  /** Подписка на анимации окна; вызывающий обязан сохранить отписку. */
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

  dispose() {
    this.gate?.cancel();
    this.disposeContent();
  }

  /** Проверить hover-зону в точке; у обычных окон - no-op. */
  probe(_x: number, _y: number, _relativeTo: Gtk.Widget): void {}

  /** Курсор покинул поверхность; у обычных окон - no-op. */
  hoverOut(): void {}

  /** Revealer'ы, чьи анимации двигают форму; Pop добавляет hover-зону. */
  protected watchedRevealers(): Gtk.Revealer[] {
    return [this.revealer];
  }

  abstract measure(relativeTo: Gtk.Widget): WindowMeasure;
  abstract apply(): void;
}

/** Видимое тело и input-область окна; считаются за один проход. */
export interface WindowMeasure {
  body: Rect | null;
  input: Rect | null;
}
