import { state } from '@lib/state/app';
import { useWindowApi } from '@lib/windows/host';
import type { FloatSpec, PopSpec } from '@lib/windows/spec';
import { MAnimatedContainer } from '@ui/MAnimatedContainer';
import { MCava } from '@ui/MCava';
import { ICONS } from '@widgets/icons';
import Players from '@widgets/Players';
import Settings from '@widgets/Settings';
import Workspaces from '@widgets/Workspaces';
import { With } from 'ags';
import { Gtk } from 'ags/gtk4';
import AstalCava from 'gi://AstalCava?version=0.1';

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

function PlayerHover() {
  const { opened } = useWindowApi();

  const cava = AstalCava.get_default()!;

  const { cavaMode } = state;

  return (
    <MAnimatedContainer class="hover-row" hexpand>
      <With value={opened}>
        {(opened) => (
          <box spacing={8} heightRequest={opened ? 100 : undefined}>
            <image
              iconName={ICONS.media.play}
              css={opened ? undefined : '-gtk-icon-size: 10px;'}
            />
            <MCava
              cava={cava}
              hexpand
              minBarHeight={2}
              sag={0.25}
              mode={cavaMode}
              vexpand
              css={'color: var(--tertiary);'}
            />
          </box>
        )}
      </With>
    </MAnimatedContainer>
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
