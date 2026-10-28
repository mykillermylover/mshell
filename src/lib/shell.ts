import type { Gdk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import AstalHyprland from 'gi://AstalHyprland';
import GLib from 'gi://GLib';

import { debugDomain } from './commands/debug';
import type { DomainTable, MonitorFrames } from './commands/registry';
import { Registry } from './commands/registry';
import { formatReply } from './commands/reply';
import { windowDomain } from './commands/window';
import { config } from './config/app';
import { handleDebug } from './debug';
import { Frame } from './frame/Frame';
import type { FloatSpec, PopSpec } from './windows/spec';

const debugEnabled = GLib.getenv('MSHELL_DEBUG') === '1';

/**
 * Window host for all monitors: keeps a Frame per screen and creates and
 * destroys them when the monitor list changes. Commands are domains, wired
 * together here (see lib/commands/).
 */
export class Shell {
  #frames = new Map<Gdk.Monitor, Frame>();
  readonly #queued = new Set<string>();
  readonly #commands: Registry;
  readonly #pops: PopSpec[];
  readonly #floats: FloatSpec[];

  constructor(pops: PopSpec[], floats: FloatSpec[]) {
    this.#pops = pops;
    this.#floats = floats;

    const frames: MonitorFrames<Frame> = {
      byConnector: (connector) =>
        [...this.#frames.values()].find(
          (frame) => frame.connector === connector,
        ),
      all: () => [...this.#frames.values()],
      focused: () => {
        const list = [...this.#frames.values()];
        const name = AstalHyprland.get_default()?.focusedMonitor?.name;
        return list.find((frame) => frame.connector === name) ?? list[0];
      },
    };

    const domains: DomainTable = { window: windowDomain(frames) };
    if (debugEnabled) {
      domains.debug = debugDomain(frames, handleDebug);
    }

    this.#commands = new Registry(domains);
  }

  reconcile() {
    const current = app.get_monitors();

    for (const monitor of current) {
      if (!this.#frames.has(monitor)) {
        this.#frames.set(
          monitor,
          new Frame(monitor, this.#pops, this.#floats, config.style),
        );
      }
    }

    for (const [monitor, frame] of this.#frames) {
      if (!current.includes(monitor)) {
        frame.destroy();
        this.#frames.delete(monitor);
      }
    }
  }

  /**
   * Creating/destroying windows right in the monitor model handler is not allowed:
   * at that moment GTK still holds its own layout. We defer to idle and
   * coalesce a batch of changes (two monitors plugged in at once - one reconcile).
   */
  scheduleReconcile() {
    this.#queueOnce('reconcile', () => this.reconcile());
  }

  /**
   * Any config edit (including through `tune`) redraws the shape.
   * We coalesce a batch of edits into one refresh: the slider must not produce
   * a full snap on every pixel.
   */
  refresh() {
    this.#queueOnce('refresh', () => {
      for (const frame of this.#frames.values()) {
        frame.refresh();
      }
    });
  }

  /** `mshell <domain> <action> [args...] [--monitor <connector>]` */
  request(argv: string[], respond: (reply: string) => void) {
    void Promise.resolve(this.#commands.run(argv)).then((reply) =>
      respond(formatReply(reply)),
    );
  }

  /** Idle coalescing: several calls in a row give one pass. */
  #queueOnce(key: string, run: () => void) {
    if (this.#queued.has(key)) {
      return;
    }
    this.#queued.add(key);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this.#queued.delete(key);
      run();
      return GLib.SOURCE_REMOVE;
    });
  }
}
