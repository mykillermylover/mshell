import { Hyprland } from '@lib/hyprland';
import { useMonitor } from '@lib/utils';
import { createBinding, createComputed, For } from 'ags';
import { Gtk } from 'ags/gtk4';
import type AstalHyprland from 'gi://AstalHyprland';

export default function Test() {
  const workspaces = createBinding(Hyprland, 'workspaces');

  const [monitor, onMap] = useMonitor();

  const currWorkspaces = createComputed(() =>
    workspaces()
      .filter((w) => w.id > 0 && w.monitor.model === monitor()?.model)
      .sort((a, b) => a.id - b.id),
  );

  return (
    <box marginEnd={100} onMap={onMap}>
      <For each={currWorkspaces}>
        {(item: AstalHyprland.Workspace) => {
          return (
            <box>
              <Gtk.GestureClick
                onPressed={() => Hyprland.focus_workspace(item.id)}
              />
              <label label={item.id.toString()} />
            </box>
          );
        }}
      </For>
    </box>
  );
}
