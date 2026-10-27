// Theme policy: the system colour scheme and the palette request. The CSS
// provider lives in css.ts - its lifecycle has nothing to do with the config.
import { config } from '@lib/config/app';
import Adw from 'gi://Adw';

import { requestPalette } from './generate';
import {
  normalizeThemePreference,
  normalizeThemeScheme,
  ThemePreference,
} from './policy';

export { initTheme } from './css';

// wallpaper|scheme|contrast of the last started generation.
let lastPaletteSignature = '';

/** System scheme or forced one — for the whole AGS process. */
function applyThemeMode(value: string) {
  const mode = normalizeThemePreference(value);
  const sm = Adw.StyleManager.get_default();

  if (mode === ThemePreference.LIGHT) {
    sm.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
  } else if (mode === ThemePreference.DARK) {
    sm.color_scheme = Adw.ColorScheme.FORCE_DARK;
  } else {
    sm.color_scheme = Adw.ColorScheme.DEFAULT;
  }
}

/** Run matugen if wallpaper, scheme, contrast or preferred colours changed. */
function syncPalette(force = false) {
  const wallpaper = config.theme.wallpaper();
  if (!wallpaper) {
    return;
  }

  const scheme = normalizeThemeScheme(config.theme.scheme());
  const contrast = config.theme.contrast();
  const preferredColors = config.theme.preferredColors();
  const signature = `${wallpaper}|${scheme}|${contrast}|${preferredColors}`;

  if (!force && signature === lastPaletteSignature) {
    return;
  }

  lastPaletteSignature = signature;
  requestPalette({ wallpaper, scheme, contrast, preferredColors });
}

/** Single entry point: mode and palette are always applied together. */
export function applyTheme(force = false) {
  applyThemeMode(config.theme.mode());
  syncPalette(force);
}
