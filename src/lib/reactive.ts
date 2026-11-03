// Accessor с записью. Чтение остаётся обычным Accessor (gnim и JSX узнают его
// через instanceof), а set живёт на том же объекте — так запись не ломает тип
// свойства: `Accessor<T> | T` нельзя ни вызвать, ни присвоить значение в T.
import { Accessor } from 'ags';
import type { Gtk } from 'ags/gtk4';

// Сеттер объявлен методом, а не свойством: для свойства TS проверяет
// контравариантность параметра и `State<X>` перестаёт присваиваться в
// `State<Leaf>` — на этом ломается дерево конфига.
export type State<T> = Accessor<T> & { set(value: T): void };

export type MaybeAccessor<T> = Accessor<T> | T;

/**
 * Навесить сеттер на Accessor. Вызывать один раз на Accessor: повторный вызов
 * перезапишет set, поэтому кэширующие потребители зовут его при создании.
 */
export function settable<T>(
  read: Accessor<T>,
  set: (value: T) => void,
): State<T> {
  return Object.assign(read, { set });
}

/** The prop comes as a plain value or an Accessor: one shape for the body. */
export const asAccessor = <T>(value: MaybeAccessor<T>): Accessor<T> =>
  value instanceof Accessor ? value : new Accessor(() => value);

export function findController<T extends Gtk.EventController>(
  widget: Gtk.Widget,
  ControllerType: new (...args: never[]) => T,
): T | null {
  const controllers = widget.observe_controllers();

  for (let i = 0; i < controllers.get_n_items(); i++) {
    const controller = controllers.get_item(i);

    if (controller instanceof ControllerType) {
      return controller;
    }
  }

  return null;
}
