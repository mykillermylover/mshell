import { useWindowApi } from '@lib/windows/host';
import { createBinding, For } from 'ags';
import type { Timer } from 'ags/time';
import { timeout } from 'ags/time';
import AstalHyprland from 'gi://AstalHyprland';

function focusWorkspace(id: number) {
  AstalHyprland.get_default()?.dispatch(
    `hl.dsp.focus({ workspace = "${id}" })`,
    '',
  );
}

export default function Workspaces() {
  const hyprland = AstalHyprland.get_default();
  const workspaces = createBinding(hyprland, 'workspaces');
  const focusedMonitor = createBinding(hyprland, 'focusedMonitor');

  const { monitor, close, open, opened, hovered } = useWindowApi();

  const currWorkspaces = workspaces((workspaces) =>
    workspaces
      .filter((w) => w.id > 0 && w.monitor.model === monitor.model)
      .sort((a, b) => a.id - b.id),
  );

  let timer: Timer;

  hovered.subscribe(() => {
    if (hovered() && timer) {
      timer.cancel();
    }
  });

  const showWindow = () => {
    if (monitor.model !== focusedMonitor.peek()?.model) {
      return;
    }

    if (timer) {
      timer.cancel();
    }

    if (!opened()) {
      open();
    }

    timer = timeout(1000, () => close());
  };

  hyprland.connect('workspace-added', showWindow);
  hyprland.connect('workspace-removed', showWindow);
  createBinding(hyprland, 'focusedWorkspace').subscribe(showWindow);

  return (
    <box spacing={8}>
      <For each={currWorkspaces}>
        {(item) => {
          return (
            <button onClicked={() => focusWorkspace(item.id)}>
              <label label={item.id.toString()} />
            </button>
          );
        }}
      </For>
    </box>
  );
}
