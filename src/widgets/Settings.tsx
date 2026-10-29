import { config } from '@lib/config/app';
import { configFields } from '@lib/config/schema';
import type { Field, FileField } from '@lib/fields';
import { state } from '@lib/state/app';
import { stateFields } from '@lib/state/schema';
import { useWindowApi, type WindowApi } from '@lib/windows/host';
import pickFile from '@ui/filePicker';
import MDropDown from '@ui/MDropDown';
import MSlider from '@ui/MSlider';
import { ICONS } from '@widgets/icons';
import { Gtk } from 'ags/gtk4';

function FileControl({ field, api }: { field: FileField; api: WindowApi }) {
  async function browse() {
    // The dialog is a separate window: the cursor leaves the hover zone and the
    // panel would close by hideDelay — pin it for the duration of the choice.
    const wasPinned = api.pinned.peek();
    api.pin();
    try {
      const file = await pickFile({
        title: field.label,
        mimeTypes: field.accept.mimeTypes,
        name: field.accept.name,
        suffixes: field.accept.suffixes,
      });

      const path = file?.get_path() ?? null;

      if (path) {
        field.set(path);
      }
    } finally {
      if (!wasPinned) {
        api.unpin();
      }
    }
  }

  return (
    <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6} hexpand>
      <entry
        hexpand
        text={field.value}
        onEditingDone={({ text }) => field.set(text)}
      />
      <button onClicked={() => void browse()}>
        <label label="Browse" />
      </button>
    </box>
  );
}

function FieldControl({ field, api }: { field: Field; api: WindowApi }) {
  switch (field.kind) {
    case 'text': {
      return (
        <entry
          widthRequest={100}
          hexpand
          text={field.value}
          onEditingDone={({ text }) => field.set(text)}
        />
      );
    }
    case 'number': {
      return (
        <box
          halign={Gtk.Align.END}
          hexpand
          orientation={Gtk.Orientation.HORIZONTAL}
          spacing={10}
        >
          <label
            xalign={0}
            label={field.value((v) => v.toFixed(2))}
            widthRequest={100}
          />
          <MSlider
            widthRequest={200}
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
      return (
        <MDropDown
          value={field.value}
          widthRequest={200}
          halign={Gtk.Align.END}
          options={field.options}
          onValueChange={field.set}
          maxRows={3}
        />
      );
    }
    case 'file': {
      return <FileControl field={field} api={api} />;
    }
    case 'bool': {
      return (
        <box hexpand halign={Gtk.Align.END}>
          <switch
            active={field.value}
            onNotifyActive={({ active }) => field.set(active)}
          />
        </box>
      );
    }
  }
}

const getSection = (list: Field[]): Map<string, Field[]> => {
  const sectionFields = new Map<string, Field[]>();

  for (const field of list) {
    const { section } = field;

    const entry = sectionFields.get(section) ?? [];

    entry.push(field);
    sectionFields.set(section, entry);
  }

  return sectionFields;
};

function SectionSettings({ fieldsMap }: { fieldsMap: Map<string, Field[]> }) {
  const api = useWindowApi();

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
      {[...fieldsMap.entries()].map(([section, fields]) => {
        return (
          <box orientation={Gtk.Orientation.VERTICAL} hexpand>
            <label label={section} />
            {fields.map((field) => (
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={40}>
                <label label={field.label || field.key} />
                <FieldControl field={field} api={api} />
              </box>
            ))}
          </box>
        );
      })}
    </box>
  );
}

export default function Settings() {
  const fieldsList = configFields(config);
  const stateList = stateFields(state);

  const sectionFields = getSection(fieldsList);

  const sectionStateFields = getSection(stateList);

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
      <label label={'=== THEMING ==='} />
      <SectionSettings fieldsMap={sectionFields} />
      <label label={'=== STATE ==='} />
      <SectionSettings fieldsMap={sectionStateFields} />
    </box>
  );
}
