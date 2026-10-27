// The window domain: the only place that knows about frames and monitors.
import type { MonitorFrames } from './MonitorFrames';
import type { CallContext, Command, Domain } from './registry';

/** Actions on one window. A closed set: each one is a method of CommandFrame. */
export type WindowAction = 'toggle' | 'open' | 'close';

/** Every command of the domain. */
export type WindowCommand = WindowAction | 'closeall';

const ACTION_HELP: Record<WindowAction, string> = {
  toggle: 'toggle a window by id',
  open: 'open a window by id',
  close: 'close a window by id',
};

/**
 * What the domain needs from one frame. `frame[action]` is the dispatch, so a
 * new WindowAction is a compile error until CommandFrame grows the method.
 */
export interface CommandFrame {
  has(id: string): boolean;
  toggle(id: string): void;
  open(id: string): void;
  close(id: string): void;
  closeAll(): void;
}

/** `frame[action](id)`: a new WindowAction fails to compile without the method. */
export function windowDomain<F extends CommandFrame>(
  frames: MonitorFrames<F>,
): Domain {
  /** An explicit monitor that matches nothing is not the focused one. */
  const resolve = (ctx: CallContext): F | undefined =>
    ctx.monitor ? frames.byConnector(ctx.monitor) : frames.focused();

  const action = (name: WindowAction): Command => ({
    help: ACTION_HELP[name],
    run: (ctx) => {
      const frame = resolve(ctx);
      const id = ctx.args[0];

      if (!frame) {
        return { kind: 'no-frame' };
      }
      if (!id || !frame.has(id)) {
        return { kind: 'unknown-window', id: id ?? '' };
      }

      frame[name](id);
      return { kind: 'ok' };
    },
  });

  const commands: Record<WindowCommand, Command> = {
    toggle: action('toggle'),
    open: action('open'),
    close: action('close'),
    closeall: {
      help: 'close every window, or only the --monitor one',
      run: (ctx) => {
        // Without a monitor every frame closes: that is what the name promises.
        // The focused frame must not narrow it - only a monitor does.
        if (ctx.monitor) {
          const frame = frames.byConnector(ctx.monitor);
          if (!frame) {
            return { kind: 'no-frame' };
          }
          frame.closeAll();
          return { kind: 'ok' };
        }

        for (const frame of frames.all()) {
          frame.closeAll();
        }
        return { kind: 'ok' };
      },
    },
  };

  return { help: 'Windows of the frame', commands };
}
