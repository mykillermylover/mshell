import { asAccessor } from '@lib/utils';
import type { Accessor } from 'ags';
import { For } from 'ags';
import { createComputed, createState } from 'ags';
import Gtk from 'gi://Gtk';

export type DropDownProps<T extends string> = JSX.IntrinsicElements['box'] & {
  options: T[] | readonly T[] | Accessor<T[]>;
  value?: T | Accessor<T>;
  onValueChange: (value: T) => void;
  maxRows?: number | Accessor<number>;
};

export default function DropDown<T extends string>({
  onValueChange,
  options,
  maxRows,
  value,
  ...restProps
}: DropDownProps<T>) {
  const optionsAccessor = asAccessor(options);
  const maxRowsAccessor = asAccessor(
    maxRows ?? optionsAccessor.as((options) => options.length),
  );

  const [open, setOpen] = createState(false);

  const initialValue = asAccessor(value ?? optionsAccessor.peek()[0]).peek();
  const [current, setCurrent] = createState(initialValue);
  const [rowHeight, setRowHeight] = createState(0);

  current.subscribe(() => onValueChange(current.peek()));

  const filteredOptions = createComputed(() =>
    optionsAccessor().filter((option) => option !== current()),
  );
  const maxContentHeight = createComputed(
    () => maxRowsAccessor() * rowHeight(),
  );

  const measureRow = (self: Gtk.Widget) => {
    if (rowHeight.peek() === 0) {
      setRowHeight(self.measure(Gtk.Orientation.VERTICAL, -1)[1]);
    }
  };

  return (
    <box
      {...restProps}
      orientation={Gtk.Orientation.VERTICAL}
      overflow={Gtk.Overflow.HIDDEN}
      class={'dropdown'}
    >
      <button
        class={open.as(
          (open) => `dropdown-selected ${open ? 'opened' : 'closed'}`,
        )}
        label={current}
        onClicked={() => setOpen(!open.peek())}
      />

      <revealer
        revealChild={open}
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
      >
        <scrolledwindow
          maxContentHeight={maxContentHeight}
          propagateNaturalHeight
          hexpand
          hscrollbarPolicy={Gtk.PolicyType.NEVER}
        >
          <box orientation={Gtk.Orientation.VERTICAL}>
            <For each={filteredOptions}>
              {(option) => (
                <button
                  class={'dropdown-option'}
                  $={measureRow}
                  label={option}
                  onClicked={() => {
                    setCurrent(option);
                    setOpen(false);
                  }}
                />
              )}
            </For>
          </box>
        </scrolledwindow>
      </revealer>
    </box>
  );
}
