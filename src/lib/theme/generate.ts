import { isAbsolutePath } from '@lib/utils';
import { execAsync } from 'ags/process';
import GLib from 'gi://GLib';

import type { ThemeScheme } from './policy';

export interface PaletteRequest {
  wallpaper: string;
  scheme: ThemeScheme;
  contrast: number;
}

const DEBOUNCE_MS = 300;

let pending: PaletteRequest | null = null;
let debounceId: number | null = null;
let running = false;

function paletteScript(): string {
  // В собранном бандле SRC указывает на share; в dev - корень репозитория.
  const root = typeof SRC === 'string' ? SRC : GLib.get_current_dir();

  return GLib.build_filenamev([root, 'scripts', 'palette.sh']);
}

async function run() {
  if (running || pending === null) {
    return;
  }

  const request = pending;
  pending = null;

  const script = paletteScript();
  if (!GLib.file_test(script, GLib.FileTest.EXISTS)) {
    console.warn(`theme: palette script not found: ${script}`);
    return;
  }

  if (!isAbsolutePath(request.wallpaper)) {
    console.warn(
      `theme: wallpaper must be absolute, got: ${request.wallpaper}`,
    );
    return;
  }

  if (!GLib.file_test(request.wallpaper, GLib.FileTest.EXISTS)) {
    console.warn(`theme: wallpaper not found: ${request.wallpaper}`);
    return;
  }

  running = true;
  try {
    await execAsync([
      script,
      request.wallpaper,
      request.scheme,
      String(request.contrast),
    ]);
  } catch (error) {
    console.warn(`theme: palette generation failed: ${String(error)}`);
  } finally {
    running = false;
    // Если за время запуска пришёл новый запрос - подхватим его.
    void run();
  }
}

/** Debounce и сериализация: matugen не должен запускаться пачкой. */
export function requestPalette(request: PaletteRequest) {
  pending = request;

  if (debounceId !== null) {
    GLib.source_remove(debounceId);
  }

  debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
    debounceId = null;
    void run();
    return GLib.SOURCE_REMOVE;
  });
}
