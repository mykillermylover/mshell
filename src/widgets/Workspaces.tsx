import { useWindowApi } from '@lib/windows/host';
import { MAnimatedContainer } from '@ui/MAnimatedContainer';
import { createBinding, For } from 'ags';
import type { Timer } from 'ags/time';
import { timeout } from 'ags/time';
import Adw from 'gi://Adw';
import AstalHyprland from 'gi://AstalHyprland';

function focusWorkspace(id: number) {
  AstalHyprland.get_default()?.dispatch(
    `hl.dsp.focus({ workspace = "${id}" })`,
    '',
  );
}

interface WorkspaceProps {
  id: number;
}
function Workspace({ id }: WorkspaceProps) {
  const hyprland = AstalHyprland.get_default();
  const focused = createBinding(hyprland, 'focusedWorkspace').as(
    (ws) => ws?.id === id,
  );

  const classes = focused.as((focused) => {
    const classes = ['workspaces-btn'];

    if (focused) {
      classes.push('focused');
    }

    return classes;
  });

  return (
    <button
      $={(self) => self.set_cursor_from_name('pointer')}
      cssClasses={classes}
      onClicked={() => focusWorkspace(id)}
    >
      <label label={id.toString()} />
    </button>
  );
}

export default function Workspaces() {
  const hyprland = AstalHyprland.get_default();
  const workspaces = createBinding(hyprland, 'workspaces');
  const focusedMonitor = createBinding(hyprland, 'focusedMonitor');

  const { monitor, close, open, opened, hovered } = useWindowApi();

  const currWorkspaces = workspaces.as((workspaces) =>
    workspaces
      .filter((w) => w?.id > 0 && w.monitor.model === monitor.model)
      .sort((a, b) => a?.id - b?.id),
  );

  let timer: Timer;

  hovered.subscribe(() => {
    if (hovered.peek() && timer) {
      timer.cancel();
    }
  });

  const showWindow = () => {
    if (hovered.peek()) {
      return;
    }

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
    <MAnimatedContainer
      transitionDuration={150}
      transitionType={Adw.Easing.EASE_IN_OUT}
    >
      <box spacing={4} class="workspaces">
        <For each={currWorkspaces}>{(item) => <Workspace id={item.id} />}</For>
      </box>
    </MAnimatedContainer>
  );
}
