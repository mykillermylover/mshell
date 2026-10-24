import GLib from 'gi://GLib';

export const PALETTE_DIR = GLib.build_filenamev([
  GLib.get_user_cache_dir(),
  'mshell',
]);
export const PALETTE_FILE = GLib.build_filenamev([PALETTE_DIR, 'palette.css']);
