export function noop(): void {}

/** We don't expand `~` and `$HOME`: the config only accepts absolute paths. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/');
}
