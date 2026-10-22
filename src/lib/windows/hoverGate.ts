// Hover-задержки и pin для попапа: чистая логика без GJS. Планировщик
// внедряется, поэтому поведение проверяется в node без GTK.
export type Cancel = () => void;

export interface HoverGateDeps {
  open(): void;
  close(): void;
  isOpen(): boolean;
  isPinned(): boolean;
  setPinned(pinned: boolean): void;
  /** Запустить `run` через `ms`; вернуть отмену. `0` обрабатывает сам gate. */
  schedule(ms: number, run: () => void): Cancel;
}

/**
 * Наведение открывает попап через `openDelay`, уход закрывает через
 * `hideDelay`. Повторное событие отменяет противоположный таймер.
 * `pin()` открывает и запрещает закрытие по уходу; `unpin()` только снимает
 * флаг — окно закроется на следующем уходе или явном close.
 */
export class HoverGate {
  private pending: Cancel | null = null;
  private readonly deps: HoverGateDeps;

  constructor(deps: HoverGateDeps) {
    this.deps = deps;
  }

  enter(openDelay: number) {
    this.cancel();
    if (this.deps.isPinned() || this.deps.isOpen()) {
      return;
    }
    this.after(openDelay, () => this.deps.open());
  }

  leave(hideDelay: number) {
    this.cancel();
    if (this.deps.isPinned() || !this.deps.isOpen()) {
      return;
    }
    this.after(hideDelay, () => this.deps.close());
  }

  pin() {
    this.cancel();
    this.deps.setPinned(true);
    this.deps.open();
  }

  unpin() {
    this.deps.setPinned(false);
  }

  /** Снять запланированный переход (destroy, явный open/close по IPC). */
  cancel() {
    this.pending?.();
    this.pending = null;
  }

  private after(ms: number, run: () => void) {
    if (ms <= 0) {
      run();
      return;
    }
    this.pending = this.deps.schedule(ms, () => {
      this.pending = null;
      run();
    });
  }
}
