import { Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';

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
  snapshot,
} from './index';

// Отдельно от config/index.ts: там только чистые данные и типы (их грузит node),
// а gi://GLib есть только в GJS.
const PATH = GLib.build_filenamev([
  GLib.get_user_config_dir(),
  'mshell',
  'config.json',
]);
const SAVE_DELAY_MS = 500;
const RELOAD_DELAY_MS = 200;
// Номера POSIX-сигналов: GLibUnix их не экспортирует.
const SIGTERM = 15;
const SIGINT = 2;

// Точки, куда процесс реально завершается. AGS 3 в quit() сразу вызывает
// exit(): Gtk.Application::shutdown не эмитится, а DBus-обработчик `ags quit`
// держит собственную привязку app.quit из конструктора App - подменить её
// нельзя. Общий путь любого quit(), включая DBus-копию, - прототип
// Gtk.Application. Плюс сигналы сеанса: лог-аут Hyprland, kill, Ctrl+C.
let exitHooked = false;

// FileMonitor должен жить, пока живёт приложение.
const configMonitors: Gio.FileMonitor[] = [];

export function hookExit(flush: () => void): void {
  if (exitHooked) {
    return;
  }

  const quit = Gtk.Application.prototype.quit;
  Gtk.Application.prototype.quit = function (this: Gtk.Application) {
    try {
      flush();
    } finally {
      quit.call(this);
    }
  };

  app.connect('shutdown', flush);

  const stop = () => {
    app.quit(); // хук выше запишет конфиг
    return GLib.SOURCE_REMOVE;
  };
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, SIGTERM, stop);
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, SIGINT, stop);

  exitHooked = true;
}

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
      tree = merge(DEFAULTS, loaded);
      valid = true;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: ${PATH}: ${why} - работаем на дефолтах`);
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
    // Дебаунс: серия правок подряд (ползунок) даёт одну запись в конце.
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
      // Планируем до уведомления: исключение в подписчике не должно отменять
      // сохранение уже принятого значения.
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
        return; // дебаунс уже записал - второй раз не пишем
      }

      GLib.source_remove(pending);
      save();
    },
  };

  // Методы живут рядом с деревом, а не внутри: дерево - то, что пишется в файл.
  const instance: Config = Object.assign({}, values, methods);

  /** Внешняя правка файла: перечитываем и патчим только листья. */
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
      const next = merge(DEFAULTS, raw);
      lastWritten = text;

      applyingExternal = true;
      try {
        for (const key of Object.keys(next) as (keyof ConfigValues)[]) {
          patchInto(values[key], next[key]);
        }
      } finally {
        applyingExternal = false;
      }

      // Валидация что-то поправила (дефолты, лимиты, чужие ключи) -
      // фиксируем нормализованный вариант. Иначе файл не трогаем.
      if (JSON.stringify(snapshot(values)) !== JSON.stringify(raw)) {
        scheduleSave();
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(
        `config: reload ${PATH}: ${why} - оставляем текущие значения`,
      );
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

  // Дописываем недостающие дефолты (например, новую секцию theme), но
  // битый файл не перезаписываем.
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
 * Конфиг поверх ~/.config/mshell/config.json: чтение с фоллбеком к дефолтам
 * по каждому ключу, запись с дебаунсом. Битый файл не роняет оболочку и не
 * перезаписывается - предупреждение в лог, дальше дефолты.
 *
 * Один на процесс: создаётся при импорте модуля, фабрику наружу не отдаём -
 * два конфига означали бы два независимых дерева значений.
 */
export const config: Config = init();
