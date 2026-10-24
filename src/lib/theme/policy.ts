/** Выбор пользователя: системная схема или принудительная. */
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

/**
 * Минимальная проверка сгенерированной палитры: без этих токенов
 * компоненты останутся без цвета, поэтому файл не применяем.
 */
export function isPaletteCss(css: string): boolean {
  return css.includes('--mshell-surface') && css.includes('--mshell-fg');
}
