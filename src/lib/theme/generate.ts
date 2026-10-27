import { glibScheduler } from '@lib/time/glibScheduler';
import { Debounce } from '@lib/time/schedule';
import { execAsync } from 'ags/process';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { PALETTE_DIR, PALETTE_FILE } from './paths';
import {
  isAbsolutePath,
  type ThemePreferredColors,
  type ThemeScheme,
} from './policy';

export interface PaletteRequest {
  wallpaper: string;
  scheme: ThemeScheme;
  contrast: number;
  preferredColors: ThemePreferredColors;
}

const DEBOUNCE_MS = 300;

let pending: PaletteRequest | null = null;
const debounce = new Debounce(DEBOUNCE_MS, glibScheduler);
let running = false;

function templateFile(): string {
  // In the built bundle SRC points to share; in dev it's the repository root.
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
    // the temp file is not critical
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
      request.preferredColors,
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

/** Debounce and serialization: matugen must not run in bursts. */
export function requestPalette(request: PaletteRequest) {
  pending = {
    ...pending,
    ...request,
  };

  debounce.schedule(() => void run());
}
