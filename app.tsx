import { createBinding } from 'ags';
import app from 'ags/gtk4/app';

import { config } from './lib/config-app';
import { Shell } from './lib/shell';
import { FLOATS, POPS } from './lib/windows';
import style from './style.css';

const shell = new Shell(POPS, FLOATS);

app.start({
  css: style,
  main() {
    shell.reconcile();
    // app.monitors — обычное свойство GObject: createBinding сам подписывается
    // на notify::monitors, поэтому руками сигналы модели ловить не нужно
    createBinding(app, 'monitors').subscribe(() => shell.scheduleReconcile());
    config.subscribe(() => shell.refresh());
  },
  // ags request [<connector>] toggle|open|close|closeall <id>
  // Debug-команды — только при MSHELL_DEBUG=1, см. lib/debug.ts.
  requestHandler(argv: string[], respond: (r: string) => void) {
    shell.request(argv, respond);
  },
});
