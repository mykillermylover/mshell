// Timer primitives without GJS. The scheduler is injected, so the timing is
// tested in node: see tests/schedule.test.ts.
export interface Scheduler {
  /** Run `run` after `ms`; return the source id for cancel(). */
  after(ms: number, run: () => void): number;
  cancel(id: number): void;
}

/**
 * Debounce: the last schedule wins, one run per quiet period.
 * A run that reschedules from inside itself starts a new wait - the timer
 * is released before the callback, so the new id is not clobbered.
 */
export class Debounce {
  private id: number | null = null;

  constructor(
    private readonly ms: number,
    private readonly scheduler: Scheduler,
  ) {}

  /** Whether a run is scheduled. */
  get pending(): boolean {
    return this.id !== null;
  }

  schedule(run: () => void) {
    this.cancel();
    this.id = this.scheduler.after(this.ms, () => {
      this.id = null;
      run();
    });
  }

  cancel() {
    if (this.id === null) {
      return;
    }
    this.scheduler.cancel(this.id);
    this.id = null;
  }
}
