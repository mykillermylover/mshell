// The debug domain: the same flat handler the shell always had, wrapped as a
// domain. handleDebug is injected, so this module stays free of GJS and the
// argument layout of the debug commands is unchanged.
import type { MonitorFrames } from './MonitorFrames';
import type { CallContext, Command, CommandTable, Domain } from './registry';

/** What handleDebug looks like: it answers with text, undefined means "not mine". */
export type DebugHandler<F> = (frame: F, argv: string[]) => string | undefined;

/** The actions handleDebug answers, with the line the help shows. */
const DEBUG_ACTIONS: Record<string, string> = {
  at: 'place a float at absolute x,y',
  bench: 'animate a float for a load sample',
  frames: 'processed tick count',
  hover: 'simulate a hover enter/leave',
  inputs: 'input rects of all windows',
  pair: 'place two floats at a fixed gap',
  pin: 'pin a popover',
  place: 'place a float at an edge with a gap',
  rects: 'visible bodies of all windows',
  region: 'the applied input region',
  snap: 'run the magnet on a float',
  spawn: 'create benchmark floats',
  tune: 'set a style key at runtime',
  unpin: 'unpin a popover',
};

/**
 * `mshell debug <action> [args...] [--monitor <connector>]`.
 * The action is put back in front of the arguments: the debug handler reads
 * argv[1], argv[2] and knows nothing about domains.
 */
export function debugDomain<F>(
  frames: MonitorFrames<F>,
  handle: DebugHandler<F>,
): Domain {
  const command = (action: string, help: string): Command => ({
    help,
    run: (ctx: CallContext) => {
      // An explicit monitor that matches nothing is not the focused one.
      const frame = ctx.monitor
        ? frames.byConnector(ctx.monitor)
        : frames.focused();
      if (!frame) {
        return { kind: 'no-frame' };
      }

      const answer = handle(frame, [action, ...ctx.args]);
      return answer === undefined
        ? { kind: 'unknown-command', name: `debug ${action}` }
        : { kind: 'text', text: answer };
    },
  });

  const commands: CommandTable = {};
  for (const [action, help] of Object.entries(DEBUG_ACTIONS)) {
    commands[action] = command(action, help);
  }

  return { help: 'Live debug commands (MSHELL_DEBUG=1)', commands };
}
