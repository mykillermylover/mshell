import { useWindowApi } from '@lib/windows/api';
import { Gtk } from 'ags/gtk4';

// Каскад демо-Float: старт от угла и шаг, px.
const SPAWN_ORIGIN = 80;
const SPAWN_STEP = 24;

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
      <label class="pop-title" label="Settings" xalign={0} />
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
            x: SPAWN_ORIGIN + spawned * SPAWN_STEP,
            y: SPAWN_ORIGIN + spawned * SPAWN_STEP,
            content: Spawned,
          });
        }}
      >
        <label label="Создать Float" />
      </button>
    </box>
  );
}
