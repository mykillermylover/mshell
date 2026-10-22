import Settings from '@widgets/Settings';
import Test from '@widgets/Test';
import { Gtk } from 'ags/gtk4';

import type { FloatSpec } from './Float';
import type { PopSpec } from './Pop';

export const POPS: PopSpec[] = [];
export const FLOATS: FloatSpec[] = [];

function addPop(spec: PopSpec) {
  POPS.push(spec);
}

function addFloat(spec: FloatSpec) {
  FLOATS.push(spec);
}

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
  return (
    <box class="hover-row" spacing={8}>
      <image iconName="media-playback-start-symbolic" />
      <label label="Player" />
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

// Выезжают из краёв: ags request toggle player
addPop({
  id: 'player',
  edge: 'top',
  hover: { content: PlayerHover, hideOnReveal: true },
  content: Player,
});
addPop({
  id: 'settings',
  edge: 'right',
  hover: true,
  content: Settings,
});
addPop({ id: 'launcher', edge: 'bottom', content: Launcher });
addPop({
  id: 'workspaces',
  edge: 'top',
  hover: true,
  align: 'end',
  content: Test,
});

// Плавающие: таскаются за заголовок; ags request toggle notes
addFloat({ id: 'notes', title: 'Notes', x: 200, y: 260, content: Notes });
addFloat({ id: 'mixer', title: 'Mixer', x: 560, y: 340, content: Mixer });
