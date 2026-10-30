// The window registry of one frame: ids, order, subscriptions and the single
// measurement pass the whole field depends on. No GJS: a body only has to
// measure, subscribe, apply and dispose.
import type { Rect } from '@lib/geometry';

/** What the registry needs from a window. Window (Pop, Float) provides more. */
export interface Measured {
  /** The shape may have changed; the caller keeps `unsubscribe`. */
  subscribe(fn: () => void): () => void;
  apply(): void;
  dispose(): void;
}

export interface FieldMeasure {
  rects: Rect[];
  inputs: Rect[];
}

export interface Registered extends Measured {
  readonly id: string;
}

/** One window measured in field coordinates. */
export type MeasureBody<T> = (body: T) => {
  body: Rect | null;
  input: Rect | null;
};

/**
 * Windows by id in insertion order. Bodies and input areas are measured in a
 * single pass: liquid, input region and the magnet all read the same layout,
 * so the shape is a function of the windows and nothing else.
 */
export class FrameWindows<T extends Registered = Registered> {
  readonly #map = new Map<string, T>();
  readonly #unsubscribes = new Map<string, () => void>();

  /** The measure is injected: the registry knows nothing about GTK coordinates. */
  readonly #measureBody: MeasureBody<T>;

  constructor(measureBody: MeasureBody<T>) {
    this.#measureBody = measureBody;
  }

  /** Add with a unique id, subscribe to its shape changes. */
  add(body: T, poke: () => void = () => {}) {
    if (this.#map.has(body.id)) {
      throw new Error(`duplicate window id: ${body.id}`);
    }

    this.#map.set(body.id, body);
    this.#unsubscribes.set(body.id, body.subscribe(poke));
  }

  get(id: string): T | undefined {
    return this.#map.get(id);
  }

  has(id: string): boolean {
    return this.#map.has(id);
  }

  /** Drop the window from the field and dispose it; false if there was none. */
  remove(id: string): boolean {
    const body = this.#map.get(id);
    if (!body) {
      return false;
    }

    this.#map.delete(id);
    this.#unsubscribes.get(id)?.();
    this.#unsubscribes.delete(id);
    body.dispose();
    return true;
  }

  bodies(): T[] {
    return [...this.#map.values()];
  }

  /**
   * Bodies and input areas in field coordinates in a single pass.
   * A window without a visible body still contributes input: that is the
   * closed hover lip, the very thing that opens it.
   */
  measure(): FieldMeasure {
    const rects: Rect[] = [];
    const inputs: Rect[] = [];

    for (const body of this.#map.values()) {
      const measured = this.#measureBody(body);
      if (measured.body) {
        rects.push(measured.body);
      }
      if (measured.input) {
        inputs.push(measured.input);
      }
    }

    return { rects, inputs };
  }

  apply() {
    for (const body of this.#map.values()) {
      body.apply();
    }
  }

  dispose() {
    for (const body of this.bodies()) {
      body.dispose();
    }
    this.#map.clear();
    this.#unsubscribes.clear();
  }
}
