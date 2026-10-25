import type { Gdk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import AstalHyprland from 'gi://AstalHyprland';
import GLib from 'gi://GLib';

import { config } from './config/app';
import { handleDebug } from './debug';
import { Frame } from './frame/Frame';
import type { FloatSpec, PopSpec } from './windows/api';

const debugEnabled = GLib.getenv('MSHELL_DEBUG') === '1';

/**
 * Window host for all monitors: keeps a Frame per screen, creates and
 * destroys them when the monitor list changes, and handles request commands.
 */
export class Shell {
  private frames = new Map<Gdk.Monitor, Frame>();
  private readonly queued = new Set<string>();

  constructor(
    private readonly pops: PopSpec[],
    private readonly floats: FloatSpec[],
  ) {}

  reconcile() {
    const current = app.get_monitors();

    for (const monitor of current) {
      if (!this.frames.has(monitor)) {
        this.frames.set(
          monitor,
          new Frame(monitor, this.pops, this.floats, config.style),
        );
      }
    }

    for (const [monitor, frame] of this.frames) {
      if (!current.includes(monitor)) {
        frame.destroy();
        this.frames.delete(monitor);
      }
    }
  }

  /**
   * Creating/destroying windows right in the monitor model handler is not allowed:
   * at that moment GTK still holds its own layout. We defer to idle and
   * coalesce a batch of changes (two monitors plugged in at once - one reconcile).
   */
  scheduleReconcile() {
    this.queueOnce('reconcile', () => this.reconcile());
  }

  /**
   * Any config edit (including through `tune`) redraws the shape.
   * We coalesce a batch of edits into one refresh: the slider must not produce
   * a full snap on every pixel.
   */
  refresh() {
    this.queueOnce('refresh', () => {
      for (const frame of this.frames.values()) {
        frame.refresh();
      }
    });
  }

  request(argv: string[], respond: (r: string) => void) {
    const named = [...this.frames.values()].find(
      (frame) => frame.connector === argv[0],
    );
    const args = named ? argv.slice(1) : argv;
    const [cmd, id] = args;

    // Without a connector closeall applies to all monitors, not only
    // the focused one: that's exactly what the command name promises.
    if (cmd === 'closeall') {
      const targets = named ? [named] : this.frames.values();
      for (const frame of targets) {
        frame.closeAll();
      }
      return respond('ok');
    }

    const frame = named ?? this.focusedFrame();
    if (!frame) {
      return respond('no frame');
    }

    switch (cmd) {
      case 'toggle':
      case 'open':
      case 'close': {
        if (!id || !frame.has(id)) {
          return respond(`unknown window: ${id ?? ''}`);
        }
        if (cmd === 'toggle') {
          frame.toggle(id);
        } else if (cmd === 'open') {
          frame.open(id);
        } else {
          frame.close(id);
        }
        return respond('ok');
      }
    }

    if (debugEnabled) {
      const result = handleDebug(frame, args);
      if (result !== undefined) {
        return respond(result);
      }
    }
    return respond(`unknown command: ${cmd}`);
  }

  /** Idle coalescing: several calls in a row give one pass. */
  private queueOnce(key: string, run: () => void) {
    if (this.queued.has(key)) {
      return;
    }
    this.queued.add(key);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this.queued.delete(key);
      run();
      return GLib.SOURCE_REMOVE;
    });
  }

  private focusedFrame(): Frame | undefined {
    const frames = [...this.frames.values()];
    const name = AstalHyprland.get_default()?.focusedMonitor?.name;
    return frames.find((frame) => frame.connector === name) ?? frames[0];
  }
}
