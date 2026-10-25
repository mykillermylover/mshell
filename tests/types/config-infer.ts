// tests/types/config-infer.ts
// Файл не выполняется: его компилирует `npm run test:types`.
import {
  type Config,
  type ConfigValues,
  type FieldStyle,
  type Reactive,
} from '@lib/config';
import type { ThemePreference } from '@lib/theme/policy';

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// enum сохраняется, числовые листья расширяются до number
export type ModeIsEnum = Assert<
  Equal<ConfigValues['theme']['mode'], ThemePreference>
>;
export type BorderIsNumber = Assert<Equal<FieldStyle['border'], number>>;
export type ContrastIsNumber = Assert<
  Equal<ConfigValues['theme']['contrast'], number>
>;

declare const style: Reactive<FieldStyle>;
style.border.set(5); // number — можно

// @ts-expect-error число вне типа листа не принимается
style.border.set('5');

declare const config: Config;
config.update('style', { border: 5 });
// @ts-expect-error чужой ключ в патче
config.update('style', { bogus: 1 });
