import { createBinding } from 'ags';
import type { Gdk } from 'ags/gtk4';
import { Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import AstalHyprland from 'gi://AstalHyprland';
import GLib from 'gi://GLib';

import { config } from './lib/config-app';
import { handleDebug } from './lib/debug';
import { type FloatSpec, Frame, type PopSpec } from './lib/Frame';
import style from './style.css';

// ─────────────────────────── контент окон ───────────────────────────
// Ваши виджеты. Фон и отступы не задавать: фон рисует поле жидкости,
// отступы — .frame-body в style.css.
// JSX-элемент приводим к Widget один раз, чтобы не писать это в каждом content.
const widget = (e: unknown) => e as Gtk.Widget;

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

// Выезжают из краёв: ags request toggle player
const POPS: PopSpec[] = [
  {
    id: 'player',
    edge: 'top',
    align: 'center',
    content: () =>
      widget(
        <Card
          title="Player"
          body="Выезжает из верхней стороны"
          w={420}
          h={120}
        />,
      ),
  },
  {
    id: 'settings',
    edge: 'right',
    align: 'center',
    content: () =>
      widget(
        <Card
          title="Settings"
          body="Выезжает из правой стороны"
          w={300}
          h={360}
        />,
      ),
  },
  {
    id: 'launcher',
    edge: 'bottom',
    align: 'center',
    content: () =>
      widget(
        <Card
          title="Launcher"
          body="Выезжает из нижней стороны"
          w={520}
          h={220}
        />,
      ),
  },
];

// Плавающие: таскаются за заголовок; ags request toggle notes
const FLOATS: FloatSpec[] = [
  {
    id: 'notes',
    title: 'Notes',
    x: 200,
    y: 260,
    content: () =>
      widget(
        <Card
          title="Тащи к краю"
          body="Рядом с рамкой — слипнется"
          w={240}
          h={110}
        />,
      ),
  },
  {
    id: 'mixer',
    title: 'Mixer',
    x: 560,
    y: 340,
    content: () =>
      widget(
        <Card
          title="Или к другому окну"
          body="Окна тоже слипаются"
          w={260}
          h={100}
        />,
      ),
  },
];

// ─────────────────────────── запуск ───────────────────────────
const frames = new Map<Gdk.Monitor, Frame>();
const debugEnabled = GLib.getenv('MSHELL_DEBUG') === '1';

// Любая правка конфига (в том числе через `tune`) перерисовывает форму.
config.subscribe(() => {
  for (const frame of frames.values()) {
    frame.refresh();
  }
});

function reconcile() {
  const current = app.get_monitors();
  for (const monitor of current) {
    if (!frames.has(monitor)) {
      frames.set(monitor, new Frame(monitor, POPS, FLOATS, config.style));
    }
  }
  for (const [monitor, frame] of frames) {
    if (!current.includes(monitor)) {
      frame.destroy();
      frames.delete(monitor);
    }
  }
}

// Создавать/уничтожать окна прямо в обработчике модели мониторов нельзя:
// GTK в этот момент ещё держит свою раскладку. Откладываем на idle и склеиваем
// пачку изменений (подключили два монитора сразу — один reconcile).
let reconcileQueued = false;
function scheduleReconcile() {
  if (reconcileQueued) {
    return;
  }
  reconcileQueued = true;
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    reconcileQueued = false;
    reconcile();
    return GLib.SOURCE_REMOVE;
  });
}

function focusedFrame(): Frame | undefined {
  const name = AstalHyprland.get_default().focusedMonitor?.name;
  return (
    [...frames.values()].find((frame) => frame.connector === name) ??
    [...frames.values()][0]
  );
}

app.start({
  css: style,
  main() {
    reconcile();
    // app.monitors — обычное свойство GObject: createBinding сам подписывается
    // на notify::monitors, поэтому руками сигналы модели ловить не нужно
    createBinding(app, 'monitors').subscribe(scheduleReconcile);
  },
  // ags request [<connector>] toggle|open|close|closeall <id>
  // Debug-команды — только при MSHELL_DEBUG=1, см. lib/debug.ts.
  // <connector> (например eDP-1) выбирает монитор явно — иначе берётся фокусный
  requestHandler(argv: string[], respond: (r: string) => void) {
    const named = [...frames.values()].find(
      (frame) => frame.connector === argv[0],
    );
    const args = named ? argv.slice(1) : argv;
    const [cmd, id] = args;
    const frame = named ?? focusedFrame();
    if (!frame) {
      return respond('no frame');
    }
    switch (cmd) {
      case 'toggle': {
        frame.toggle(id);
        return respond('ok');
      }
      case 'open': {
        frame.open(id);
        return respond('ok');
      }
      case 'close': {
        frame.close(id);
        return respond('ok');
      }
      case 'closeall': {
        frame.closeAll();
        return respond('ok');
      }
    }
    if (debugEnabled) {
      const result = handleDebug(frame, args);
      if (result !== undefined) {
        return respond(result);
      }
    }
    return respond(`unknown command: ${cmd}`);
  },
});
