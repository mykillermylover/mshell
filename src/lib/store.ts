import {
  limits,
  merge,
  patchInto,
  reactive,
  snapshot,
  values,
} from '@lib/config';
import type { DeepPartial, Values } from '@lib/config/derive';
import type { Node, Reactive, ReactiveNode, Section } from '@lib/config/leaf';
import { glibScheduler } from '@lib/time/glibScheduler';
import { Debounce } from '@lib/time/schedule';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Separate from config/index.ts: it holds only pure data and types (node loads them),
// while gi://GLib exists only in GJS.
const SAVE_DELAY_MS = 500;
const RELOAD_DELAY_MS = 200;

// FileMonitor must live as long as the application lives.
const monitors: Gio.FileMonitor[] = [];

export type StoreMethods<V extends object> = {
  /** Point edit of section leaves. */
  update<K extends keyof V>(section: K, patch: DeepPartial<V[K]>): void;
  /** Any change to any leaf. Returns an unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Write now (called on exit). */
  flush(): void;
};

/** Top-level shape of a store: a section, never a lone leaf. */
export type SectionNode = { readonly [key: string]: Node };

/** Values<N> is an object for SectionNode - the conditional makes TS see it. */
type StoreValues<N extends SectionNode> =
  Values<N> extends object ? Values<N> : never;

/** A JSON file behind a reactive tree built from the schema. */
export type Store<N extends SectionNode> = Reactive<StoreValues<N>> &
  StoreMethods<StoreValues<N>>;

/**
 * JSON file on top of a schema: reading with a fallback to defaults per key,
 * writing with debounce, and re-reading on an external edit. A corrupted file
 * does not crash the shell and is not overwritten - a warning in the log, then
 * defaults.
 *
 * The schema is the only source of truth: types, defaults, limits and
 * normalization all come from it.
 */
export function createStore<N extends SectionNode>(
  path: string,
  schema: N,
): Store<N> {
  type V = StoreValues<N>;
  const exists = GLib.file_test(path, GLib.FileTest.EXISTS);
  let tree: V = values(schema) as V;
  let loaded: DeepPartial<V> | null = null;
  let lastWritten: string | null = null;
  let valid = !exists;

  if (exists) {
    try {
      const [, bytes] = GLib.file_get_contents(path);
      const text = new TextDecoder().decode(bytes);
      lastWritten = text;
      loaded = JSON.parse(text) as DeepPartial<V>;
      tree = merge(schema, loaded) as V;
      valid = true;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`store: ${path}: ${why} - running on defaults`);
    }
  }

  const listeners = new Set<() => void>();
  const saveDebounce = new Debounce(SAVE_DELAY_MS, glibScheduler);
  let applyingExternal = false;

  const nodes = reactive(tree, changed, limits(schema)) as Reactive<V>;

  function save(): void {
    try {
      const text = `${JSON.stringify(snapshot(nodes), null, 4)}\n`;
      if (text === lastWritten) {
        return;
      }

      GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
      const ok = GLib.file_set_contents(path, text);

      if (ok) {
        lastWritten = text;
      } else {
        console.warn(`store: cannot write ${path}`);
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`store: cannot save ${path}: ${why}`);
    }
  }

  function scheduleSave(): void {
    // Debounce: a series of edits in a row (a slider) gives one write at the end.
    saveDebounce.schedule(save);
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

  const methods: StoreMethods<V> = {
    update: (section, patch) => {
      patchInto(nodes[section] as ReactiveNode, patch as DeepPartial<Section>);
    },
    subscribe: (fn) => {
      listeners.add(fn);

      return () => {
        listeners.delete(fn);
      };
    },
    flush: () => {
      if (!saveDebounce.pending) {
        return; // the debounce already wrote - do not write a second time
      }

      saveDebounce.cancel();
      save();
    },
  };

  // Methods live next to the tree, not inside it: the tree is what is written to the file.
  const instance = Object.assign({}, nodes, methods) as Store<N>;

  /** External file edit: re-read and patch only leaves. */
  function reload(): void {
    try {
      const [ok, bytes] = GLib.file_get_contents(path);
      if (!ok) {
        return;
      }

      const text = new TextDecoder().decode(bytes);
      if (text === lastWritten) {
        return;
      }

      saveDebounce.cancel();

      const raw = JSON.parse(text) as DeepPartial<V>;
      const next = merge(schema, raw) as V;
      lastWritten = text;

      applyingExternal = true;
      try {
        for (const key of Object.keys(next) as (keyof V)[]) {
          patchInto(
            nodes[key] as ReactiveNode,
            next[key] as DeepPartial<Section>,
          );
        }
      } finally {
        applyingExternal = false;
      }

      // Validation fixed something (defaults, limits, unknown keys) -
      // persist the normalized version. Otherwise leave the file alone.
      if (JSON.stringify(snapshot(nodes)) !== JSON.stringify(raw)) {
        scheduleSave();
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`store: reload ${path}: ${why} - keeping current values`);
    }
  }

  function watch(): void {
    const dir = GLib.path_get_dirname(path);
    const name = GLib.path_get_basename(path);

    GLib.mkdir_with_parents(dir, 0o755);

    const monitor = Gio.File.new_for_path(dir).monitor_directory(
      Gio.FileMonitorFlags.NONE,
      null,
    );
    const reloadDebounce = new Debounce(RELOAD_DELAY_MS, glibScheduler);

    monitor.connect('changed', (_monitor, file) => {
      if (file?.get_basename() !== name) {
        return;
      }

      reloadDebounce.schedule(reload);
    });

    monitors.push(monitor);
  }

  // Append missing defaults (for example, a new section), but do not
  // rewrite a corrupted file.
  if (
    valid &&
    (loaded === null ||
      JSON.stringify(snapshot(nodes)) !== JSON.stringify(loaded))
  ) {
    save();
  }

  watch();

  return instance;
}
