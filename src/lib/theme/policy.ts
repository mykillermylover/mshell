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
  CONTENT = 'scheme-content',
  EXPRESSIVE = 'scheme-expressive',
  FIDELITY = 'scheme-fidelity',
  FRUIT_SALAD = 'scheme-fruit-salad',
  MONOCHROME = 'scheme-monochrome',
  NEUTRAL = 'scheme-neutral',
  RAINBOW = 'scheme-rainbow',
  SMART = 'scheme-smart',
  TONAL_SPOT = 'scheme-tonal-spot',
  VIBRANT = 'scheme-vibrant',
}

function isThemeScheme(value: string): value is ThemeScheme {
  return (Object.values(ThemeScheme) as string[]).includes(value);
}

/** Короткое имя (`neutral`) тоже принимаем. */
export function normalizeThemeScheme(value: string): ThemeScheme {
  const full = value.startsWith('scheme-') ? value : `scheme-${value}`;

  return isThemeScheme(full) ? full : ThemeScheme.TONAL_SPOT;
}

/**
 * Минимальная проверка сгенерированной палитры: без этих токенов
 * компоненты останутся без цвета, поэтому файл не применяем.
 */
export function isPaletteCss(css: string): boolean {
  return css.includes('--surface') && css.includes('--on_surface');
}
