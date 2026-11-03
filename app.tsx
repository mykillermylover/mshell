import { config } from '@lib/config/app';
import { hookExit } from '@lib/exit';
import { Shell } from '@lib/shell';
import { state } from '@lib/state/app';
import { applyTheme, initTheme } from '@lib/theme/apply';
import { createBinding } from 'ags';
import { Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';

import { INITIAL_FLOATS, INITIAL_POPS } from './src/windows';
import style from './style.scss';

// Shell is just window specs: GJS resources are created in main() and Frame.
const shell = new Shell(INITIAL_POPS, INITIAL_FLOATS);

function applyInhibit() {
  // GTK goes through org.freedesktop.portal.Inhibit; a missing backend gives cookie 0,
  // and uninhibit(0) must not be called. Inhibitors are dropped by GTK on exit.
  let cookie = 0;
  const syncInhibit = () => {
    if (state.inhibit.peek() && !cookie) {
      cookie = app.inhibit(
        null,
        Gtk.ApplicationInhibitFlags.IDLE,
        'Idle inhibitor',
      );
    } else if (!state.inhibit.peek() && cookie) {
      app.uninhibit(cookie);
      cookie = 0;
    }
  };
  syncInhibit();
  state.inhibit.subscribe(syncInhibit);
}

app.start({
  instanceName: 'mshell-dev',
  main() {
    applyTheme(true);
    initTheme(style);

    // The exit hook installs the GObject patch and catches session signals: only in main.
    hookExit(() => {
      config.flush();
      state.flush();
    });
    shell.reconcile();
    // app.monitors is a regular GObject property: createBinding subscribes
    // to notify::monitors itself, so there is no need to catch model signals by hand
    createBinding(app, 'monitors').subscribe(() => shell.scheduleReconcile());
    config.subscribe(() => {
      applyTheme();
      shell.refresh();
    });

    applyInhibit();
  },
  // ags request <domain> <action> [args...] [--monitor <connector>]
  // Domains are wired in lib/shell.ts; `debug` exists only with MSHELL_DEBUG=1.
  requestHandler(argv: string[], respond: (r: string) => void) {
    shell.request(argv, respond);
  },
});
