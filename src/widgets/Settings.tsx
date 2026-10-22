import { useWindowApi } from '@lib/windows/api';
import { Gtk } from 'ags/gtk4';

export default function Settings() {
  const win = useWindowApi();
  const pinLabel = win.pinned.as((pinned) =>
    pinned ? 'Открепить' : 'Закрепить',
  );

  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={6}
      widthRequest={300}
      heightRequest={360}
    >
      <label class="title" label="Settings" xalign={0} />
      <label label="Выезжает из правой стороны" xalign={0} wrap />
      <button class="pin-button" onClicked={() => win.togglePin()}>
        <label label={pinLabel} />
      </button>
    </box>
  );
}
