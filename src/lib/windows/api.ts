import type { Accessor } from 'ags';
import { createContext } from 'ags';

/**
 * Возможности конкретного окна, доступные его контенту. Это handle, а не
 * Shell: чужие окна и внутренности Frame через него не достать.
 */
export interface WindowApi {
  /** Идентификатор окна из его спеки. */
  readonly id: string;
  /** Закреплено ли окно — реактивно, для UI. */
  readonly pinned: Accessor<boolean>;
  pin(): void;
  unpin(): void;
  togglePin(): void;
  open(): void;
  close(): void;
  toggle(): void;
}

/** Контекст окна: Window предоставляет его контенту, хук читает. */
export const WindowContext = createContext<WindowApi | null>(null);

/**
 * API окна, в контенте которого вызван хук. Вызывать в начале компонента
 * (как useContext); в обработчиках используйте уже полученный объект.
 */
export function useWindowApi(): WindowApi {
  const api = WindowContext.use();
  if (!api) {
    throw new Error('useWindowApi(): контент создан вне окна');
  }
  return api;
}
