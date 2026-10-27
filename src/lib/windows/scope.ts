// A gnim scope per window content: the lifecycle that gives content its api.
import { createRoot } from 'ags';

const noop = () => {};

import { type WindowApi, WindowContext } from './host';

/**
 * Run `build` in its own scope with the window api provided. Used for both
 * the main content and the hover zone: both must live and die with the window.
 */
export function createWindowScope<T>(
  api: WindowApi,
  build: () => T,
): { content: T; dispose: () => void } {
  let dispose = noop;
  const content = createRoot((rootDispose) => {
    dispose = rootDispose;
    return WindowContext.provide(api, build);
  });
  return { content, dispose };
}
