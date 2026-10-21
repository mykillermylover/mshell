import type { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';

/**
 * Всё, что lib-слою нужно знать об окне. Revealer, hover-зона и внутренности
 * компонента скрыты за этим интерфейсом.
 */
export interface WindowBody {
  /** Видимая часть окна в координатах relativeTo: x, y, w, h. */
  bounds(relativeTo: Gtk.Widget): Rect | null;

  /**
   * Область ввода: может быть шире видимого тела. У hover-попапа она
   * достраивается до blurReach, чтобы ховер ловился по blur-эффекту,
   * даже если видимая губа короче.
   */
  inputBounds(relativeTo: Gtk.Widget): Rect | null;

  /** Целевое состояние: открыт/закрыт. */
  readonly open: boolean;
  /** Идёт переход: open ещё не совпал с фактическим. */
  readonly animating: boolean;

  setOpen(open: boolean): void;
  /**
   * Переключить само окно. `Frame` не использует его для попапов: там нужна
   * эксклюзивность через `open()`/`close()` (остальные попапы закрываются).
   */
  toggle(): void;

  /** Изменение состояния/раскладки: lib делает poke. */
  subscribe(fn: () => void): () => void;
}

/** Границы тела окна; null, если оно ещё не разложено. */
export const boundsOf = (
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null => {
  const [ok, bounds] = widget.compute_bounds(relativeTo);
  if (!ok || bounds.get_width() < 1 || bounds.get_height() < 1) {
    return null;
  }
  return {
    x: bounds.get_x(),
    y: bounds.get_y(),
    w: bounds.get_width(),
    h: bounds.get_height(),
  };
};
