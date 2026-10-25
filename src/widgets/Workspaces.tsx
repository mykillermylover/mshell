import { focusWorkspace } from '@lib/hyprland';
import { useWindowApi } from '@lib/windows/api';
import { createBinding, createComputed, For } from 'ags';
import AstalHyprland from 'gi://AstalHyprland';

export default function Workspaces() {
  // The singleton is inside the content: the module also runs in the client (see App and CLI).
  const hyprland = AstalHyprland.get_default();
  const workspaces = createBinding(hyprland, 'workspaces');

  const { monitor } = useWindowApi();

  const currWorkspaces = createComputed(() =>
    workspaces()
      .filter((w) => w.id > 0 && w.monitor.model === monitor.model)
      .sort((a, b) => a.id - b.id),
  );

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
