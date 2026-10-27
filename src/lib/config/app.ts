import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  type Config,
  type ConfigMethods,
  type ConfigValues,
  type DeepPartial,
  DEFAULTS,
  LIMITS,
  merge,
  patchInto,
  reactive,
  SCHEMA,
  snapshot,
} from './index';

// Separate from config/index.ts: it holds only pure data and types (node loads them),
// while gi://GLib exists only in GJS.
const PATH = GLib.build_filenamev([
  GLib.get_user_config_dir(),
  'mshell',
  'config.json',
]);
const SAVE_DELAY_MS = 500;
const RELOAD_DELAY_MS = 200;

// FileMonitor must live as long as the application lives.
const configMonitors: Gio.FileMonitor[] = [];

function init(): Config {
  const exists = GLib.file_test(PATH, GLib.FileTest.EXISTS);
  let tree: ConfigValues = DEFAULTS;
  let loaded: DeepPartial<ConfigValues> | null = null;
  let lastWritten: string | null = null;
  let valid = !exists;

  if (exists) {
    try {
      const [, bytes] = GLib.file_get_contents(PATH);
      const text = new TextDecoder().decode(bytes);
      lastWritten = text;
      loaded = JSON.parse(text) as DeepPartial<ConfigValues>;
      tree = merge(SCHEMA, loaded);
      valid = true;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: ${PATH}: ${why} - running on defaults`);
    }
  }

  const listeners = new Set<() => void>();
  let pending: number | null = null;
  let applyingExternal = false;

  function save(): void {
    pending = null;

    try {
      const text = `${JSON.stringify(snapshot(values), null, 4)}\n`;
      if (text === lastWritten) {
        return;
      }

      GLib.mkdir_with_parents(GLib.path_get_dirname(PATH), 0o755);
      const ok = GLib.file_set_contents(PATH, text);

      if (ok) {
        lastWritten = text;
      } else {
        console.warn(`config: cannot write ${PATH}`);
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: cannot save ${PATH}: ${why}`);
    }
  }

  function scheduleSave(): void {
    // Debounce: a series of edits in a row (a slider) gives one write at the end.
    if (pending !== null) {
      GLib.source_remove(pending);
    }
    pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
      save();
      return GLib.SOURCE_REMOVE;
    });
  }

  function changed(): void {
    if (!applyingExternal) {
      // Schedule before notifying: an exception in a subscriber must not cancel
      // saving of an already accepted value.
      scheduleSave();
    }

    for (const listener of listeners) {
      listener();
    }
  }

  const values = reactive(tree, changed, LIMITS);

  const methods: ConfigMethods = {
    update: (section, patch) => {
      patchInto(values[section], patch);
    },
    subscribe: (fn) => {
      listeners.add(fn);

      return () => {
        listeners.delete(fn);
      };
    },
    flush: () => {
      if (pending === null) {
        return; // the debounce already wrote - do not write a second time
      }

      GLib.source_remove(pending);
      save();
    },
  };

  // Methods live next to the tree, not inside it: the tree is what is written to the file.
  const instance: Config = Object.assign({}, values, methods);

  /** External file edit: re-read and patch only leaves. */
  function reload(): void {
    try {
      const [ok, bytes] = GLib.file_get_contents(PATH);
      if (!ok) {
        return;
      }

      const text = new TextDecoder().decode(bytes);
      if (text === lastWritten) {
        return;
      }

      if (pending !== null) {
        GLib.source_remove(pending);
        pending = null;
      }

      const raw = JSON.parse(text) as DeepPartial<ConfigValues>;
      const next = merge(SCHEMA, raw);
      lastWritten = text;

      applyingExternal = true;
      try {
        for (const key of Object.keys(next) as (keyof ConfigValues)[]) {
          patchInto(values[key], next[key]);
        }
      } finally {
        applyingExternal = false;
      }

      // Validation fixed something (defaults, limits, unknown keys) -
      // persist the normalized version. Otherwise leave the file alone.
      if (JSON.stringify(snapshot(values)) !== JSON.stringify(raw)) {
        scheduleSave();
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: reload ${PATH}: ${why} - keeping current values`);
    }
  }

  function watch(): void {
    const dir = GLib.path_get_dirname(PATH);
    const name = GLib.path_get_basename(PATH);

    GLib.mkdir_with_parents(dir, 0o755);

    const monitor = Gio.File.new_for_path(dir).monitor_directory(
      Gio.FileMonitorFlags.NONE,
      null,
    );
    let reloadId: number | null = null;

    monitor.connect('changed', (_monitor, file) => {
      if (file?.get_basename() !== name) {
        return;
      }

      if (reloadId !== null) {
        GLib.source_remove(reloadId);
      }

      reloadId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        RELOAD_DELAY_MS,
        () => {
          reloadId = null;
          reload();
          return GLib.SOURCE_REMOVE;
        },
      );
    });

    configMonitors.push(monitor);
  }

  // Append missing defaults (for example, a new theme section), but do not
  // rewrite a corrupted file.
  if (
    valid &&
    (loaded === null ||
      JSON.stringify(snapshot(values)) !== JSON.stringify(loaded))
  ) {
    save();
  }

  watch();

  return instance;
}

/**
 * Config on top of ~/.config/mshell/config.json: reading with a fallback to defaults
 * per key, writing with debounce. A corrupted file does not crash the shell and is not
 * overwritten - a warning in the log, then defaults.
 *
 * One per process: created on module import, the factory is not exposed -
 * two configs would mean two independent value trees.
 */
export const config: Config = init();
