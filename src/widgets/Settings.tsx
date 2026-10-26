import type { ChoiceField, Field } from '@lib/config';
import { fields } from '@lib/config';
import { config } from '@lib/config/app';
import { useWindowApi } from '@lib/windows/api';
import { ICONS } from '@widgets/icons';
import Slider from '@widgets/Slider';
import { createState } from 'ags';
import { Gtk } from 'ags/gtk4';

function DropDown({ field }: { field: ChoiceField }) {
  const [open, setOpen] = createState(false);

  return (
    <box orientation={Gtk.Orientation.VERTICAL} hexpand>
      <button onClicked={() => setOpen(!open.peek())}>
        <label label={field.value} />
      </button>

      <revealer
        revealChild={open}
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
      >
        <box orientation={Gtk.Orientation.VERTICAL}>
          {field.options.map((option) => (
            <button
              onClicked={() => {
                field.set(option);
                setOpen(false);
              }}
            >
              <label label={option} />
            </button>
          ))}
        </box>
      </revealer>
    </box>
  );
}

function FieldControl({ field }: { field: Field }) {
  switch (field.kind) {
    case 'text': {
      return (
        <entry
          hexpand
          text={field.value}
          onEditingDone={({ text }) => field.set(text)}
        />
      );
    }
    case 'number': {
      return (
        <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10}>
          <label label={field.value((v) => v.toFixed(2))} widthRequest={100} />
          <Slider
            hexpand
            min={field.min}
            max={field.max}
            step={field.step}
            value={field.value}
            onChangeValue={(_self, _scroll, value) => field.set(value)}
          />
        </box>
      );
    }
    case 'choice': {
      return <DropDown field={field} />;
    }
    case 'bool': {
      return (
        <switch
          hexpand
          active={field.value}
          onNotifyActive={({ active }) => field.set(active)}
        />
      );
    }
  }
}

export default function Settings() {
  const fieldsList = fields(config);

  const sectionFields = new Map<string, Field[]>();

  for (const field of fieldsList) {
    const { section } = field;

    const entry = sectionFields.get(section) ?? [];

    entry.push(field);
    sectionFields.set(section, entry);
  }

  const api = useWindowApi();

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
      <box orientation={Gtk.Orientation.HORIZONTAL}>
        <label class="pop-title" label="Settings" xalign={0} />
        <box halign={Gtk.Align.END} hexpand>
          <Gtk.GestureClick onPressed={() => api.togglePin()} />
          <image
            iconName={api.pinned((pinned) =>
              pinned ? ICONS.windowUnpin : ICONS.windowPin,
            )}
          />
        </box>
      </box>
      {[...sectionFields.entries()].map(([section, fields]) => {
        return (
          <box orientation={Gtk.Orientation.VERTICAL}>
            <label label={section} />
            {fields.map((field) => (
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={40}>
                <label label={field.label || field.key} />
                <FieldControl field={field} />
              </box>
            ))}
          </box>
        );
      })}
    </box>
  );
}
