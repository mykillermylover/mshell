import { focusWorkspace } from '@lib/hyprland';
import { useMonitor } from '@widgets/monitor';
import { createBinding, createComputed, For } from 'ags';
import { Gtk } from 'ags/gtk4';
import AstalHyprland from 'gi://AstalHyprland';

export default function Test() {
  // Синглтон - внутри контента: модуль исполняется и в клиенте (см. App and CLI).
  const hyprland = AstalHyprland.get_default();
  const workspaces = createBinding(hyprland, 'workspaces');

  const [monitor, onMap] = useMonitor();

  const currWorkspaces = createComputed(() =>
    workspaces()
      .filter((w) => w.id > 0 && w.monitor.model === monitor()?.model)
      .sort((a, b) => a.id - b.id),
  );

  return (
    <box class="workspaces-pad" onMap={onMap}>
      <For each={currWorkspaces}>
        {(item: AstalHyprland.Workspace) => {
          return (
            <box>
              <Gtk.GestureClick onPressed={() => focusWorkspace(item.id)} />
              <label label={item.id.toString()} />
            </box>
          );
        }}
      </For>
    </box>
  );
}
