import { config, hookExit } from '@lib/config/app';
import { Shell } from '@lib/shell';
import { createBinding } from 'ags';
import app from 'ags/gtk4/app';

import { INITIAL_FLOATS, INITIAL_POPS } from './src/windows';
import style from './style.css';

hookExit(config.flush);

const shell = new Shell(INITIAL_POPS, INITIAL_FLOATS);

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
