export enum ThemePreference {
  SYSTEM = 'system',
  LIGHT = 'light',
  DARK = 'dark',
}

function isThemePreference(value: string): value is ThemePreference {
  const preferences = Object.values(ThemePreference) as string[];

  return preferences.includes(value);
}

/** Неизвестное значение из JSON не должно ломать запуск. */
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
 * Префикс `scheme-` - синтаксис флага matugen, а не значение конфига:
 * старые файлы с ним ещё живут, поэтому срезаем.
 */
export function normalizeThemeScheme(value: string): ThemeScheme {
  const short = value.startsWith('scheme-')
    ? value.slice('scheme-'.length)
    : value;

  return isThemeScheme(short) ? short : ThemeScheme.TONAL_SPOT;
}

/**
 * Минимальная проверка сгенерированной палитры: без этих токенов
 * компоненты останутся без цвета, поэтому файл не применяем.
 */
export function isPaletteCss(css: string): boolean {
  return css.includes('--surface') && css.includes('--on_surface');
}
