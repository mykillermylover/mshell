import type { Accessor } from 'ags';
import { createContext, createRoot } from 'ags';
import type { Gdk } from 'ags/gtk4';

import type { FloatSpec } from './Float';

/**
 * Возможности конкретного окна, доступные его контенту. Это handle окна и
 * его кадра, а не Shell: чужие мониторы и внутренности Frame недоступны.
 */
export interface WindowApi {
  /** Идентификатор окна из его спеки. */
  readonly id: string;
  /** Монитор, на котором живёт окно. */
  readonly monitor: Gdk.Monitor;
  /** Закреплено ли окно — реактивно, для UI. */
  readonly pinned: Accessor<boolean>;
  pin(): void;
  unpin(): void;
  togglePin(): void;
  open(): void;
  close(): void;
  toggle(): void;
  /** Создать Float в том же кадре/на том же мониторе. */
  addFloat(spec: FloatSpec): void;
  /** Убрать окно (по id) из этого кадра. */
  remove(id: string): void;
}

/** Узкий хост, который Frame отдаёт окну: без ссылки на сам Frame. */
export interface WindowHost {
  readonly monitor: Gdk.Monitor;
  addFloat(spec: FloatSpec): void;
  remove(id: string): void;
}

/** Контекст окна: Window предоставляет его контенту, хук читает. */
const WindowContext = createContext<WindowApi | null>(null);

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

const noop = () => {};

/**
 * Построить контент окна в отдельном scope с его api. Используется и для
 * основного контента, и для hover-зоны: оба должны жить и умирать с окном.
 */
export function createWindowContent<T>(
  api: WindowApi,
  build: () => T,
): { content: T; dispose: () => void } {
  let dispose = noop;
  const content = createRoot((rootDispose) => {
    dispose = rootDispose;
    return WindowContext.provide(api, build);
  });
  return { content, dispose };
}
