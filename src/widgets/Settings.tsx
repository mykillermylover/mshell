import type { Field, FileField } from '@lib/config';
import { fields } from '@lib/config';
import { config } from '@lib/config/app';
import { useWindowApi, type WindowApi } from '@lib/windows/api';
import { ICONS } from '@widgets/icons';
import DropDown from '@widgets/shared/DropDown';
import pickFile from '@widgets/shared/filePicker';
import Slider from '@widgets/Slider';
import { Gtk } from 'ags/gtk4';

// function DropDown({ field }: { field: ChoiceField }) {
//   const [open, setOpen] = createState(false);
//
//   return (
//     <box orientation={Gtk.Orientation.VERTICAL} hexpand>
//       <button onClicked={() => setOpen(!open.peek())}>
//         <label label={field.value} />
//       </button>
//
//       <revealer
//         revealChild={open}
//         transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
//       >
//         <box orientation={Gtk.Orientation.VERTICAL}>
//           {field.options.map((option) => (
//             <button
//               onClicked={() => {
//                 field.set(option);
//                 setOpen(false);
//               }}
//             >
//               <label label={option} />
//             </button>
//           ))}
//         </box>
//       </revealer>
//     </box>
//   );
// }

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
          <Slider
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
        <DropDown
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
