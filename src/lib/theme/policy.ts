export enum ThemePreference {
  SYSTEM = 'system',
  LIGHT = 'light',
  DARK = 'dark',
}

function isThemePreference(value: string): value is ThemePreference {
  const preferences = Object.values(ThemePreference) as string[];

  return preferences.includes(value);
}

/** An unknown value from JSON must not break startup. */
export function normalizeThemePreference(value: string): ThemePreference {
  return isThemePreference(value) ? value : ThemePreference.SYSTEM;
}

export enum ThemeScheme {
  CONTENT = 'content',
  EXPRESSIVE = 'expressive',
  FIDELITY = 'fidelity',
  FRUIT_SALAD = 'fruit-salad',
  MONOCHROME = 'monochrome',
  NEUTRAL = 'neutral',
  RAINBOW = 'rainbow',
  SMART = 'smart',
  TONAL_SPOT = 'tonal-spot',
  VIBRANT = 'vibrant',
}

function isThemeScheme(value: string): value is ThemeScheme {
  return (Object.values(ThemeScheme) as string[]).includes(value);
}

/**
 * The `scheme-` prefix is matugen flag syntax, not a config value:
 * old files with it still exist, so we strip it.
 */
export function normalizeThemeScheme(value: string): ThemeScheme {
  const short = value.startsWith('scheme-')
    ? value.slice('scheme-'.length)
    : value;

  return isThemeScheme(short) ? short : ThemeScheme.TONAL_SPOT;
}

/**
 * Minimal check of the generated palette: without these tokens
 * the components would have no color, so we don't apply the file.
 */
export function isPaletteCss(css: string): boolean {
  return css.includes('--surface') && css.includes('--on_surface');
}
