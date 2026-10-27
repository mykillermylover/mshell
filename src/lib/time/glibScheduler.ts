import GLib from 'gi://GLib';

import type { Scheduler } from './schedule';

/** Main-loop timers. Separate from schedule.ts: that one is loaded by node. */
export const glibScheduler: Scheduler = {
  after: (ms, run) =>
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      run();
      return GLib.SOURCE_REMOVE;
    }),
  cancel: (id) => {
    GLib.source_remove(id);
  },
};
