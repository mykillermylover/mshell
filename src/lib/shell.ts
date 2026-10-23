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
 * Хост окон на все мониторы: держит Frame по каждому экрану, создаёт и
 * уничтожает их при изменении списка мониторов, обслуживает request-команды.
 */
export class Shell {
  private frames = new Map<Gdk.Monitor, Frame>();
  private queued = false;
  private refreshQueued = false;

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
   * склеиваем пачку изменений (подключили два монитора сразу - один reconcile).
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

  /**
   * Любая правка конфига (в том числе через `tune`) перерисовывает форму.
   * Склеиваем пачку правок в один refresh: слайдер не должен давать
   * по полному снапшоту на каждый пиксель.
   */
  refresh() {
    if (this.refreshQueued) {
      return;
    }
    this.refreshQueued = true;
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this.refreshQueued = false;
      for (const frame of this.frames.values()) {
        frame.refresh();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  request(argv: string[], respond: (r: string) => void) {
    const named = [...this.frames.values()].find(
      (frame) => frame.connector === argv[0],
    );
    const args = named ? argv.slice(1) : argv;
    const [cmd, id] = args;

    // Без коннектора closeall относится ко всем мониторам, а не только
    // к focused: имя команды обещает именно это.
    if (cmd === 'closeall' && !named) {
      for (const frame of this.frames.values()) {
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
