import { useWindowApi } from '@lib/windows/host';
import type { FloatSpec, PopSpec } from '@lib/windows/spec';
import Settings from '@widgets/Settings';
import Workspaces from '@widgets/Workspaces';
import { Gtk } from 'ags/gtk4';

// Defaults live here, not in lib/windows: a window sets no styles of its own.
// The background is drawn by the liquid field; padding and color are ours.
function Body(child: JSX.Element) {
  return <box class="frame-body">{child}</box>;
}

function FloatHeader(props: { title: string }) {
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

function Player() {
  return (
    <Card title="Player" body="Slides out from the top side" w={420} h={120} />
  );
}

function PlayerHover() {
  const win = useWindowApi();

  return (
    <box class="hover-row" spacing={8}>
      <image iconName="media-playback-start-symbolic" />
      <label label="Player" />
      <button class="pin-button" onClicked={() => win.togglePin()}>
        <label label={win.pinned((p) => (p ? 'unpin' : 'pin'))} />
      </button>
    </box>
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

function Notes() {
  return (
    <Card
      title="Drag to the edge"
      body="Near the frame - it will stick"
      w={240}
      h={110}
    />
  );
}

function Mixer() {
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
    hover: { content: PlayerHover },
    content: Player,
  },
  {
    id: 'settings',
    edge: 'right',
    hover: true,
    content: () => Body(<Settings />),
  },
  { id: 'launcher', edge: 'bottom', content: Launcher },
  {
    id: 'workspaces',
    edge: 'top',
    align: 'end',
    exclusive: false,
    hover: true,
    offsetX: -100,
    content: () => Body(<Workspaces />),
  },
];

/** Initial Floats: created synchronously; dynamic ones - via Frame.addFloat. */
export const INITIAL_FLOATS: FloatSpec[] = [
  // {
  //   id: 'notes',
  //   header: () => <FloatHeader title="Notes" />,
  //   x: 200,
  //   y: 260,
  //   content: Notes,
  // },
  // {
  //   id: 'mixer',
  //   header: () => <FloatHeader title="Mixer" />,
  //   x: 560,
  //   y: 340,
  //   content: Mixer,
  // },
];
