import type { Rect } from '@lib/geometry';
import type { Astal } from 'ags/gtk4';
import type giCairo from 'cairo';
import Cairo from 'gi://cairo';

/**
 * Window bodies and closed hover zones are clickable; the rest of the frame and the "liquid"
 * are transparent to input. Called from the snapshot after layout: rects already
 * match the current frame.
 */
export class FrameInput {
  private key: string | null = null;
  private warned = false;

  constructor(private readonly window: Astal.Window) {}

  /** Last applied region (debug). */
  get boxes(): string | null {
    return this.key;
  }

  /** A new surface must get the region again. */
  reset() {
    this.key = null;
    // Warning - once per surface, not for the whole life of the frame.
    this.warned = false;
  }

  sync(rects: Rect[]) {
    const surface = this.window.get_surface();
    if (!surface) {
      return;
    }

    const boxes = rects.map((rect) => ({
      x: Math.floor(rect.x),
      y: Math.floor(rect.y),
      width: Math.ceil(rect.w),
      height: Math.ceil(rect.h),
    }));
    const key = boxes
      .map((box) => `${box.x},${box.y},${box.width},${box.height}`)
      .join(';');
    if (key === this.key) {
      return;
    }

    try {
      const region = new Cairo.Region() as giCairo.Region;
      for (const box of boxes) {
        region.unionRectangle(new Cairo.RectangleInt(box));
      }
      surface.set_input_region(region);
      this.key = key;
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        console.error('[frame] set_input_region:', error);
      }
    }
  }
}
