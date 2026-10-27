import { config } from '@lib/config/app';
import { hookExit } from '@lib/exit';
import { Shell } from '@lib/shell';
import { applyTheme, initTheme } from '@lib/theme/apply';
import { createBinding } from 'ags';
import app from 'ags/gtk4/app';

import { INITIAL_FLOATS, INITIAL_POPS } from './src/windows';
import style from './style.scss';

// Shell is just window specs: GJS resources are created in main() and Frame.
const shell = new Shell(INITIAL_POPS, INITIAL_FLOATS);

app.start({
  main() {
    applyTheme(true);
    initTheme(style);

    // The exit hook installs the GObject patch and catches session signals: only in main.
    hookExit(config.flush);
    shell.reconcile();
    // app.monitors is a regular GObject property: createBinding subscribes
    // to notify::monitors itself, so there is no need to catch model signals by hand
    createBinding(app, 'monitors').subscribe(() => shell.scheduleReconcile());
    config.subscribe(() => {
      applyTheme();
      shell.refresh();
    });
  },
  // ags request <domain> <action> [args...] [--monitor <connector>]
  // Domains are wired in lib/shell.ts; `debug` exists only with MSHELL_DEBUG=1.
  requestHandler(argv: string[], respond: (r: string) => void) {
    shell.request(argv, respond);
  },
});
