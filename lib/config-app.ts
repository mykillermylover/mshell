import { Gtk } from 'ags/gtk4';
import app from 'ags/gtk4/app';
import { timeout, type Timer } from 'ags/time';
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
} from './config';

// Отдельно от config.ts: там только чистые данные и типы (их грузит node),
// а gi://GLib есть только в GJS.
const PATH = GLib.build_filenamev([
  GLib.get_user_config_dir(),
  'mshell',
  'config.json',
]);
const SAVE_DELAY_MS = 500;

// Точки, куда процесс реально завершается. AGS 3 в quit() сразу вызывает
// exit(): Gtk.Application::shutdown не эмитится, а DBus-обработчик `ags quit`
// держит собственную привязку app.quit из конструктора App — подменить её
// нельзя. Общий путь любого quit(), включая DBus-копию, — прототип
// Gtk.Application. Плюс сигналы сеанса: лог-аут Hyprland, kill, Ctrl+C.
let exitHooked = false;

function hookExit(flush: () => void): void {
  if (exitHooked) {
    return;
  }

  exitHooked = true;

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
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, 15, stop); // SIGTERM
  GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, 2, stop); // SIGINT
}

/**
 * Конфиг поверх ~/.config/mshell/config.json: чтение с фоллбеком к дефолтам
 * по каждому ключу, запись с дебаунсом. Битый файл не роняет оболочку и не
 * перезаписывается — предупреждение в лог, дальше дефолты.
 *
 * Один на процесс: создаётся при импорте модуля, фабрику наружу не отдаём —
 * два конфига означали бы два независимых дерева значений.
 */
export const config: Config = init();

function init(): Config {
  const exists = GLib.file_test(PATH, GLib.FileTest.EXISTS);
  let tree: ConfigValues = DEFAULTS;

  if (exists) {
    try {
      const [, bytes] = GLib.file_get_contents(PATH);
      const text = new TextDecoder().decode(bytes);
      tree = merge(DEFAULTS, JSON.parse(text) as DeepPartial<ConfigValues>);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: ${PATH}: ${why} — работаем на дефолтах`);
    }
  }

  const listeners = new Set<() => void>();
  let pending: Timer | null = null;

  function save(): void {
    pending = null;

    try {
      GLib.mkdir_with_parents(GLib.path_get_dirname(PATH), 0o755);
      const ok = GLib.file_set_contents(
        PATH,
        `${JSON.stringify(snapshot(values), null, 4)}\n`,
      );

      if (!ok) {
        console.warn(`config: cannot write ${PATH}`);
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`config: cannot save ${PATH}: ${why}`);
    }
  }

  function changed(): void {
    for (const listener of listeners) {
      listener();
    }

    // Дебаунс: серия правок подряд (ползунок) даёт одну запись в конце.
    // ags/time — штатный таймер AGS вместо глобальных setTimeout GJS.
    pending?.cancel();
    pending = timeout(SAVE_DELAY_MS, save);
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
        return; // дебаунс уже записал — второй раз не пишем
      }

      pending.cancel();
      save();
    },
  };

  // Методы живут рядом с деревом, а не внутри: дерево — то, что пишется в файл.
  const instance: Config = Object.assign({}, values, methods);

  // Запись на выход — обязанность конфига, а не приложения.
  hookExit(methods.flush);

  if (!exists) {
    save(); // первый запуск: файл создаётся сразу с дефолтами
  }

  return instance;
}
