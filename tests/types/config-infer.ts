// tests/types/config-infer.ts
// The file is not executed: it is compiled by `npm run test:types`.
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

// the enum is preserved, numeric leaves widen to number
export type ModeIsEnum = Assert<
  Equal<ConfigValues['theme']['mode'], ThemePreference>
>;
export type BorderIsNumber = Assert<Equal<FieldStyle['border'], number>>;
export type ContrastIsNumber = Assert<
  Equal<ConfigValues['theme']['contrast'], number>
>;

declare const style: Reactive<FieldStyle>;
style.border.set(5); // number — allowed

// @ts-expect-error a number outside the leaf type is not accepted
style.border.set('5');

declare const config: Config;
config.update('style', { border: 5 });
// @ts-expect-error an unknown key in the patch
config.update('style', { bogus: 1 });
