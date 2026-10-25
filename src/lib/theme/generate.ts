import { isAbsolutePath } from '@lib/utils';
import { execAsync } from 'ags/process';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { PALETTE_DIR, PALETTE_FILE } from './paths';
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

function templateFile(): string {
  // В собранном бандле SRC указывает на share; в dev - корень репозитория.
  const root = typeof SRC === 'string' ? SRC : GLib.get_current_dir();

  return GLib.build_filenamev([
    root,
    'matugen',
    'templates',
    'mshell.css.tera',
  ]);
}

function remove(path: string) {
  try {
    const file = Gio.File.new_for_path(path);
    if (file.query_exists(null)) {
      file.delete(null);
    }
  } catch {
    // временный файл не критичен
  }
}

async function run() {
  if (running || pending === null) {
    return;
  }

  const request = pending;
  pending = null;

  if (!isAbsolutePath(request.wallpaper)) {
    console.warn(
      `theme: wallpaper must be absolute, got: ${request.wallpaper}`,
    );
    return;
  }

  const template = templateFile();
  if (!GLib.file_test(template, GLib.FileTest.EXISTS)) {
    console.warn(`theme: palette template not found: ${template}`);
    return;
  }

  if (!GLib.file_test(request.wallpaper, GLib.FileTest.EXISTS)) {
    console.warn(`theme: wallpaper not found: ${request.wallpaper}`);
    return;
  }

  running = true;
  GLib.mkdir_with_parents(PALETTE_DIR, 0o755);

  const id = GLib.uuid_string_random();
  const config = GLib.build_filenamev([PALETTE_DIR, `matugen-${id}.toml`]);
  const tmp = GLib.build_filenamev([PALETTE_DIR, `palette-${id}.tmp`]);

  try {
    const text = [
      '[config]',
      '',
      '[templates.mshell]',
      `input_path = "${template}"`,
      `output_path = "${tmp}"`,
      '',
    ].join('\n');

    if (!GLib.file_set_contents(config, text)) {
      console.warn(`theme: cannot write ${config}`);
      return;
    }

    await execAsync([
      'matugen',
      'image',
      request.wallpaper,
      '--prefer',
      'saturation',
      '-t',
      `scheme-${request.scheme}`,
      '--contrast',
      String(request.contrast),
      '-c',
      config,
    ]);

    if (GLib.rename(tmp, PALETTE_FILE) !== 0) {
      console.warn(`theme: cannot replace ${PALETTE_FILE}`);
    }
  } catch (error) {
    console.warn(`theme: palette generation failed: ${String(error)}`);
  } finally {
    remove(tmp);
    remove(config);
    running = false;
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
