export function noop(): void {}

/** `~` и `$HOME` не раскрываем: конфиг принимает только абсолютные пути. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/');
}
