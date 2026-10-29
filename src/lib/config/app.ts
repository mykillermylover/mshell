import { createStore, type Store } from '@lib/store';
import GLib from 'gi://GLib';

import { SCHEMA } from './schema';

// Separate from config/index.ts: it holds only pure data and types (node loads them),
// while gi://GLib exists only in GJS.
const PATH = GLib.build_filenamev([
  GLib.get_user_config_dir(),
  'mshell',
  'config.json',
]);

export type Config = Store<typeof SCHEMA>;

/**
 * Config on top of ~/.config/mshell/config.json: reading with a fallback to defaults
 * per key, writing with debounce. A corrupted file does not crash the shell and is not
 * overwritten - a warning in the log, then defaults.
 *
 * One per process: created on module import, the factory is not exposed -
 * two configs would mean two independent value trees.
 */
export const config: Config = createStore(PATH, SCHEMA);
