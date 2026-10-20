import type { Gdk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import AstalHyprland from 'gi://AstalHyprland';
import GLib from 'gi://GLib';

import { config } from './config/app';
import { handleDebug } from './debug';
import { Frame } from './frame/Frame';
import type { FloatSpec } from './windows/Float';
import type { PopSpec } from './windows/Pop';

const debugEnabled = GLib.getenv('MSHELL_DEBUG') === '1';

/**
 * Хост окон на все мониторы: держит Frame по каждому экрану, создаёт и
 * уничтожает их при изменении списка мониторов, обслуживает request-команды.
 */
export class Shell {
  private frames = new Map<Gdk.Monitor, Frame>();
  private queued = false;

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
   * Создавать/уничтожать окна прямо в обработчике модели мониторов нельзя:
   * GTK в этот момент ещё держит свою раскладку. Откладываем на idle и
   * склеиваем пачку изменений (подключили два монитора сразу — один reconcile).
   */
  scheduleReconcile() {
    if (this.queued) {
      return;
    }
    this.queued = true;
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this.queued = false;
      this.reconcile();
      return GLib.SOURCE_REMOVE;
    });
  }

  /** Любая правка конфига (в том числе через `tune`) перерисовывает форму. */
  refresh() {
    for (const frame of this.frames.values()) {
      frame.refresh();
    }
  }

  request(argv: string[], respond: (r: string) => void) {
    const named = [...this.frames.values()].find(
      (frame) => frame.connector === argv[0],
    );
    const args = named ? argv.slice(1) : argv;
    const [cmd, id] = args;
    const frame = named ?? this.focusedFrame();
    if (!frame) {
      return respond('no frame');
    }

    switch (cmd) {
      case 'toggle': {
        frame.toggle(id);
        return respond('ok');
      }
      case 'open': {
        frame.open(id);
        return respond('ok');
      }
      case 'close': {
        frame.close(id);
        return respond('ok');
      }
      case 'closeall': {
        frame.closeAll();
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

  private focusedFrame(): Frame | undefined {
    const name = AstalHyprland.get_default().focusedMonitor?.name;
    return (
      [...this.frames.values()].find((frame) => frame.connector === name) ??
      [...this.frames.values()][0]
    );
  }
}
