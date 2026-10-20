import type { Astal } from 'ags/gtk4';
import type giCairo from 'cairo';
import Cairo from 'gi://cairo';

import type { Rect } from './LiquidField';

/**
 * Кликабельны только сами окна; рамка и «жидкость» между ними прозрачны для ввода.
 * Вызывается из снапшота после layout: rects уже соответствуют текущему кадру.
 */
export class FrameInput {
  private key: string | null = null;
  private warned = false;

  constructor(private readonly window: Astal.Window) {}

  /** Новая surface должна получить регион заново. */
  reset() {
    this.key = null;
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
