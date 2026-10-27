// argv of an AGS request → domain, action, args and the monitor flag.
// Pure: it knows nothing about frames, monitors or commands.
export interface Parsed {
  /** The `--monitor` value, if the flag was given. */
  readonly monitor: string | undefined;
  /** Empty for an empty argv: the caller decides what to show then. */
  readonly domain: string;
  readonly action: string | undefined;
  /** Everything after the domain and the action, flags included. */
  readonly args: string[];
}

export interface BadArgument {
  readonly kind: 'bad-argument';
  readonly text: string;
}

export type ParseResult =
  { readonly parsed: Parsed } | { readonly error: BadArgument };

const FLAG = '--monitor';
const FLAG_PREFIX = `${FLAG}=`;

/**
 * `[<domain> [<action> [args...]]] [--monitor <connector> | --monitor=<connector>]`.
 *
 * The flag is stripped wherever it stands, so the word order of the command is
 * its own business. An empty argv yields an empty domain rather than an error:
 * printing the domain list is the caller's call.
 */
export function parse(argv: string[]): ParseResult {
  const rest: string[] = [];
  let monitor: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const word = argv[index];

    if (word === FLAG) {
      const value = argv[index + 1];

      if (value === undefined || value === '') {
        return {
          error: { kind: 'bad-argument', text: `${FLAG} needs a value` },
        };
      }
      monitor = value;
      index++; // the value is consumed
      continue;
    }

    if (word.startsWith(FLAG_PREFIX)) {
      const value = word.slice(FLAG_PREFIX.length);

      if (value === '') {
        return {
          error: { kind: 'bad-argument', text: `${FLAG} needs a value` },
        };
      }
      monitor = value;
      continue;
    }

    rest.push(word);
  }

  const [domain = '', action, ...args] = rest;

  return { parsed: { monitor, domain, action, args } };
}
