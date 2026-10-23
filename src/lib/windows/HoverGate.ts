// Hover-задержки: чистая логика без GJS. Планировщик внедряется, поэтому
// поведение проверяется в node без GTK. Pin — забота Window, не gate.
type Cancel = () => void;

interface HoverGateDeps {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Запустить `run` через `ms`; вернуть отмену. `0` обрабатывает сам gate. */
  schedule(ms: number, run: () => void): Cancel;
}

/**
 * Наведение открывает попап через `openDelay`, уход закрывает через
 * `hideDelay`. Повторное событие отменяет противоположный таймер.
 */
export class HoverGate {
  private pending: Cancel | null = null;
  private readonly deps: HoverGateDeps;

  constructor(deps: HoverGateDeps) {
    this.deps = deps;
  }

  enter(openDelay: number) {
    this.cancel();
    if (this.deps.isOpen()) {
      return;
    }
    this.after(openDelay, () => this.deps.open());
  }

  leave(hideDelay: number) {
    this.cancel();
    if (!this.deps.isOpen()) {
      return;
    }
    this.after(hideDelay, () => this.deps.close());
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
