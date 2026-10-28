// Hover delays: pure logic without GJS. The scheduler is injected, so
// behavior is tested in node without GTK. Pin is Window's concern, not the gate's.
type Cancel = () => void;

interface HoverGateDeps {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Run `run` after `ms`; return a cancel. `0` is handled by the gate itself. */
  schedule(ms: number, run: () => void): Cancel;
}

/**
 * Hover opens the popover after `openDelay`, leaving closes it after
 * `hideDelay`. A repeated event cancels the opposite timer.
 */
export class HoverGate {
  #pending: Cancel | null = null;
  readonly #deps: HoverGateDeps;

  constructor(deps: HoverGateDeps) {
    this.#deps = deps;
  }

  enter(openDelay: number) {
    this.cancel();
    if (this.#deps.isOpen()) {
      return;
    }
    this.#after(openDelay, () => this.#deps.open());
  }

  leave(hideDelay: number) {
    this.cancel();
    if (!this.#deps.isOpen()) {
      return;
    }
    this.#after(hideDelay, () => this.#deps.close());
  }

  /** Cancel the scheduled transition (destroy, explicit open/close via IPC). */
  cancel() {
    this.#pending?.();
    this.#pending = null;
  }

  #after(ms: number, run: () => void) {
    if (ms <= 0) {
      run();
      return;
    }
    this.#pending = this.#deps.schedule(ms, () => {
      this.#pending = null;
      run();
    });
  }
}
