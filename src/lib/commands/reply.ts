// What any command answers. `text` is the escape hatch: debug output, lists,
// anything that is not one of the named outcomes.
export type Reply =
  | { kind: 'ok' }
  | { kind: 'no-frame' }
  | { kind: 'unknown-window'; id: string }
  | { kind: 'unknown-command'; name: string }
  | { kind: 'bad-argument'; text: string }
  | { kind: 'text'; text: string };

/** Reply → the single string the AGS request handler returns. */
export function formatReply(reply: Reply): string {
  switch (reply.kind) {
    case 'ok': {
      return 'ok';
    }
    case 'no-frame': {
      return 'no frame';
    }
    case 'unknown-window': {
      return `unknown window: ${reply.id}`;
    }
    case 'unknown-command': {
      return `unknown command: ${reply.name}`;
    }
    case 'bad-argument': {
      return `bad argument: ${reply.text}`;
    }
    case 'text': {
      return reply.text;
    }
  }
}
