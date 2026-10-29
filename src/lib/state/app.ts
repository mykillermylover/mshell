import { createStore } from '@lib/store';
import GLib from 'gi://GLib';

import { type State, STATE_SCHEMA } from './schema';

// Separate from state/schema.ts: it holds only pure data and types (node loads them),
// while gi://GLib exists only in GJS.
const PATH = GLib.build_filenamev([
  GLib.get_user_state_dir(),
  'mshell',
  'state.json',
]);

/**
 * State on top of ~/.local/state/mshell/state.json: same mechanics as config,
 * but nothing here is synced between machines and none of it is theme.
 *
 * One per process: created on module import, the factory is not exposed -
 * two states would mean two independent value trees.
 */
export const state: State = createStore(PATH, STATE_SCHEMA);
