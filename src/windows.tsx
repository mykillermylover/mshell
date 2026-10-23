import { useWindowApi } from '@lib/windows/api';
import type { FloatSpec } from '@lib/windows/Float';
import type { PopSpec } from '@lib/windows/Pop';
import Settings from '@widgets/Settings';
import Test from '@widgets/Test';
import { Gtk } from 'ags/gtk4';

// Контент окон. Фон и отступы не задавать: фон рисует поле жидкости,
// отступы — .frame-body в style.css.
function Card(props: { title: string; body: string; w: number; h: number }) {
  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={6}
      widthRequest={props.w}
      heightRequest={props.h}
    >
      <label class="title" label={props.title} xalign={0} />
      <label label={props.body} xalign={0} wrap />
    </box>
  );
}

function Player() {
  return (
    <Card title="Player" body="Выезжает из верхней стороны" w={420} h={120} />
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
    <Card title="Launcher" body="Выезжает из нижней стороны" w={520} h={220} />
  );
}

function Notes() {
  return (
    <Card
      title="Тащи к краю"
      body="Рядом с рамкой — слипнется"
      w={240}
      h={110}
    />
  );
}

function Mixer() {
  return (
    <Card
      title="Или к другому окну"
      body="Окна тоже слипаются"
      w={260}
      h={100}
    />
  );
}

/** Стартовые попапы: создаются синхронно при инициализации каждого кадра. */
export const INITIAL_POPS: PopSpec[] = [
  {
    id: 'player',
    edge: 'top',
    hover: { content: PlayerHover, hideOnReveal: false },
    content: Player,
  },
  {
    id: 'settings',
    edge: 'right',
    hover: true,
    content: Settings,
  },
  { id: 'launcher', edge: 'bottom', content: Launcher },
  {
    id: 'workspaces',
    edge: 'top',
    hover: true,
    align: 'end',
    content: Test,
  },
];

/** Стартовые Float: создаются синхронно; динамические — через Frame.addFloat. */
export const INITIAL_FLOATS: FloatSpec[] = [
  { id: 'notes', title: 'Notes', x: 200, y: 260, content: Notes },
  { id: 'mixer', title: 'Mixer', x: 560, y: 340, content: Mixer },
];
