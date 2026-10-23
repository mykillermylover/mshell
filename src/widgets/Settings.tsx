import { useWindowApi } from '@lib/windows/api';
import { Gtk } from 'ags/gtk4';

let spawned = 0;

function Spawned() {
  const win = useWindowApi();

  return (
    <label
      label={`Float на ${win.monitor.get_connector() ?? '?'}`}
      xalign={0}
    />
  );
}

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
      <button
        class="pin-button"
        onClicked={() => {
          spawned += 1;
          win.addFloat({
            id: `spawn-${spawned}`,
            title: 'Spawn',
            x: 80 + spawned * 24,
            y: 80 + spawned * 24,
            content: Spawned,
          });
        }}
      >
        <label label="Создать Float" />
      </button>
    </box>
  );
}
