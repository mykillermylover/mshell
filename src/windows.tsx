import { useWindowApi } from '@lib/windows/host';
import type { FloatSpec, PopSpec } from '@lib/windows/spec';
import Players, { PlayerHover } from '@widgets/Players';
import Settings from '@widgets/Settings';
import Workspaces from '@widgets/Workspaces';
import { Gtk } from 'ags/gtk4';

// Defaults live here, not in lib/windows: a window sets no styles of its own.
// The background is drawn by the liquid field; padding and color are ours.
function Body(child: JSX.Element) {
  return <box class="frame-body">{child}</box>;
}

function _FloatHeader(props: { title: string }) {
  const api = useWindowApi();

  return (
    <box class="float-grip" spacing={8}>
      <label label={props.title} hexpand xalign={0} />
      <button class="grip-button" onClicked={() => api.close()}>
        <image iconName="window-close-symbolic" />
      </button>
    </box>
  );
}

// Window content. Do not set a background: it is drawn by the liquid field.
function Card(props: { title: string; body: string; w: number; h: number }) {
  return Body(
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={6}
      widthRequest={props.w}
      heightRequest={props.h}
    >
      <label class="pop-title" label={props.title} xalign={0} />
      <label label={props.body} xalign={0} wrap />
    </box>,
  );
}

function Launcher() {
  return (
    <Card
      title="Launcher"
      body="Slides out from the bottom side"
      w={520}
      h={220}
    />
  );
}

function _Notes() {
  return (
    <Card
      title="Drag to the edge"
      body="Near the frame - it will stick"
      w={240}
      h={110}
    />
  );
}

function _Mixer() {
  return (
    <Card
      title="Or to another window"
      body="Windows stick together too"
      w={260}
      h={100}
    />
  );
}

/** Initial popovers: created synchronously on init of each frame. */
export const INITIAL_POPS: PopSpec[] = [
  {
    id: 'player',
    edge: 'top',
    hover: { content: PlayerHover, hideOnReveal: false },
    content: Players,
    keyboard: true,
  },
  {
    id: 'settings',
    edge: 'right',
    hover: true,
    keyboard: true,
    content: () => Body(<Settings />),
  },
  { id: 'launcher', edge: 'bottom', content: Launcher },
  {
    id: 'workspaces',
    edge: 'top',
    align: 'start',
    exclusive: false,
    hover: {
      hideOnReveal: true,
      content: () => <box heightRequest={2} />,
    },
    offsetX: 45,
    content: () => <Workspaces />,
  },
];

/** Initial Floats: created synchronously; dynamic ones - via Frame.addFloat. */
export const INITIAL_FLOATS: FloatSpec[] = [
  // {
  //   id: 'notes',
  //   header: () => <_FloatHeader title="Notes" />,
  //   x: 200,
  //   y: 260,
  //   content: _Notes,
  // },
  // {
  //   id: 'mixer',
  //   header: () => <_FloatHeader title="Mixer" />,
  //   x: 560,
  //   y: 340,
  //   content: _Mixer,
  // },
];
