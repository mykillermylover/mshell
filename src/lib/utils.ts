import { Accessor } from 'ags';

export function noop(): void {}

/** We don't expand `~` and `$HOME`: the config only accepts absolute paths. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/');
}

export function asAccessor<T>(value: T | Accessor<T>): Accessor<T> {
  return value instanceof Accessor ? value : new Accessor(() => value);
}
