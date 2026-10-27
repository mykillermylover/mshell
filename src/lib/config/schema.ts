// The config itself: a new parameter is one line here.
// Key order = field order in the form.
import {
  normalizeThemeScheme,
  ThemePreference,
  ThemePreferredColors,
  ThemeScheme,
} from '@lib/theme/policy';

import type { Values } from './derive';
import {
  type DeepPartial,
  type Limits,
  limits,
  type LimitsOf,
  values,
} from './derive';
import { choice, file, type Node, num, optionsOf, type Reactive } from './leaf';

export const SCHEMA = {
  theme: {
    mode: choice<ThemePreference>({
      default: ThemePreference.SYSTEM,
      options: optionsOf(ThemePreference),
      label: 'Mode',
    }),
    scheme: choice<ThemeScheme>({
      default: ThemeScheme.TONAL_SPOT,
      options: optionsOf(ThemeScheme),
      normalize: normalizeThemeScheme,
      label: 'Scheme',
    }),
    preferredColors: choice<ThemePreferredColors>({
      default: ThemePreferredColors.SATURATION,
      options: optionsOf(ThemePreferredColors),
      label: 'Preferred Colors',
    }),
    // Empty or a relative path - the palette is not generated.
    wallpaper: file({
      default: '',
      label: 'Wallpaper',
      accept: 'images',
    }),
    contrast: num({
      default: 0,
      min: -1,
      max: 1,
      step: 0.5,
      label: 'Contrast',
    }),
  },
  style: {
    border: num({ default: 4, min: 0, max: 32, label: 'Border', unit: 'px' }),
    screenRadius: num({
      // screen corners (= rounding in Hyprland)
      default: 10,
      min: 0,
      max: 64,
      label: 'Screen corners',
      unit: 'px',
    }),
    windowRadius: num({
      default: 12,
      min: 0,
      max: 64,
      label: 'Window corners',
      unit: 'px',
    }),
    // Blur radius: σ = blurRadius / 1.35.
    blurRadius: num({ default: 10, min: 1, max: 64, label: 'Blur' }),
    // Magnet reach: at what gap the window snaps, px.
    snapReach: num({
      default: 44,
      min: 0,
      max: 200,
      label: 'Magnet',
      unit: 'px',
    }),
    // Alpha threshold steepness: the higher, the sharper the edge (≈1.5px at 2.2).
    sharp: num({
      default: 2.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: 'Steepness',
    }),
    // Magnet/push-out tween duration, ms.
    snapDuration: num({
      default: 340,
      min: 0,
      max: 2000,
      label: 'Magnet, ms',
    }),
    // Pop and Float reveal/hide duration, ms.
    revealDuration: num({
      default: 400,
      min: 0,
      max: 2000,
      label: 'Reveal, ms',
    }),
    // Lip and input hover-zone thickness (see lib/windows/popLayout.ts).
    hoverDepth: num({ default: 6, min: 1, max: 64, label: 'Lip', unit: 'px' }),
    hoverDelay: num({
      // 0 - instant, as if there were no delays
      default: 120,
      min: 0,
      max: 2000,
      label: 'Hover delay, ms',
    }),
    hideDelay: num({
      default: 300,
      min: 0,
      max: 2000,
      label: 'Hide delay, ms',
    }),
  },
} satisfies Node;

/** Static config type: everything else relies on it. */
export type ConfigValues = Values<typeof SCHEMA>;

/** User style shared by fields, windows and config. */
export type FieldStyle = ConfigValues['style'];

export const DEFAULTS: ConfigValues = values(SCHEMA);

/**
 * Config limits: applied on load, update and direct .set().
 * `& LimitsOf` gives exact types on read, `& Limits` - compatibility with
 * `reactive()`.
 */
export const LIMITS = limits(SCHEMA) as unknown as Limits &
  LimitsOf<typeof SCHEMA>;

export type ConfigMethods = {
  /** Point edit of section leaves. */
  update<K extends keyof ConfigValues>(
    section: K,
    patch: DeepPartial<ConfigValues[K]>,
  ): void;
  /** Any change to any leaf. Returns an unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Write now (called on exit). */
  flush(): void;
};

export type Config = Reactive<ConfigValues> & ConfigMethods;
