import type { Rect } from '@lib/geometry';
import { noop } from '@lib/utils';
import type { Accessor } from 'ags';
import { createContext, createRoot } from 'ags';
import type { Gdk } from 'ags/gtk4';
import { Gtk } from 'ags/gtk4';

import type { EdgeAlign, HorizontalEdge, VerticalEdge } from './popLayout';

/** Контент окна - то, что возвращает JSX-компонент. */
export type Content = () => JSX.Element;

/** Настройки hover-зоны попапа. */
export interface HoverSpec {
  content?: Content; // компонент внутри зоны
  hideOnReveal?: boolean; // скрыть зону, пока попап раскрыт
}

interface PopBase {
  id: string;
  align?: EdgeAlign; // положение вдоль края
  content: Content; // вызывается по разу на монитор; фон НЕ задавать
  hover?: true | HoverSpec; // true - дефолтные значения; нет - без hover
}

type VerticalPopSpec = PopBase & { edge: VerticalEdge; offsetY?: number };
type HorizontalPopSpec = PopBase & { edge: HorizontalEdge; offsetX?: number };

export function isVerticalEdge(spec: PopSpec): spec is VerticalPopSpec {
  return spec.edge === 'left' || spec.edge === 'right';
}

/**
 * Окно, выезжающее из края рамки (открывается/закрывается).
 * Сдвиг вдоль края типизирован по стороне: у верх/низ - offsetX,
 * у лево/право - offsetY. Положительное значение - вправо/вниз.
 */
export type PopSpec = HorizontalPopSpec | VerticalPopSpec;

/** Плавающее окно: таскается за заголовок, у рамки примагничивается и сливается с ней. */
export interface FloatSpec {
  id: string;
  title?: string;
  x: number;
  y: number;
  content: Content;
}

/**
 * Возможности конкретного окна, доступные его контенту. Это handle окна и
 * его кадра, а не Shell: чужие мониторы и внутренности Frame недоступны.
 */
export interface WindowApi {
  /** Идентификатор окна из его спеки. */
  readonly id: string;
  /** Монитор, на котором живёт окно. */
  readonly monitor: Gdk.Monitor;
  /** Закреплено ли окно - реактивно, для UI. */
  readonly pinned: Accessor<boolean>;
  togglePin(): void;
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

/** gnim типизирует результат JSX как GObject.Object; на деле это Gtk.Widget. */
export function asWidget(child: JSX.Element): Gtk.Widget {
  return child as Gtk.Widget;
}

/** Обёртка контента окна: отступы и прозрачный фон (фон рисует LiquidField). */
export function padded(child: JSX.Element): Gtk.Box {
  const body = new Gtk.Box();
  body.add_css_class('frame-body');
  body.append(asWidget(child));
  return body;
}

/** Границы тела окна; null, если оно ещё не разложено. */
export function boundsOf(
  widget: Gtk.Widget,
  relativeTo: Gtk.Widget,
): Rect | null {
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
}
