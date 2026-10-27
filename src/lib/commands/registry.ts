// Domain tables and the single dispatch over them. No GJS: a domain brings its
// own dependencies by closing over them, the registry only routes.
import { parse } from './parse';
import type { Reply } from './reply';

export interface CallContext {
  /** The `--monitor` value, if the flag was given. */
  readonly monitor: string | undefined;
  /** Everything after the domain and the action. */
  readonly args: string[];
}

/** One command: what it does and the line the help shows. */
export interface Command {
  readonly help: string;
  readonly run: (ctx: CallContext) => Reply | Promise<Reply>;
}

export type CommandTable = Record<string, Command>;

/** A domain: its caption and its commands. */
export interface Domain {
  readonly help: string;
  readonly commands: CommandTable;
}

export type DomainTable = Record<string, Domain>;

/**
 * `mshell <domain> <action> [args...] [--monitor <connector>]`.
 * An empty argv lists the domains, a bare domain lists its commands with help -
 * the registry is its own help.
 */
export class Registry {
  private readonly domains = new Map<string, Domain>();

  constructor(domains: DomainTable = {}) {
    for (const [name, domain] of Object.entries(domains)) {
      this.register(name, domain);
    }
  }

  /** Add or replace a domain; the last registration wins. */
  register(domain: string, value: Domain) {
    this.domains.set(domain, value);
  }

  run(argv: string[]): Reply | Promise<Reply> {
    const result = parse(argv);

    if ('error' in result) {
      return result.error;
    }

    const { monitor, domain, action, args } = result.parsed;

    if (!domain) {
      return { kind: 'text', text: align(domainsToHelp(this.domains)) };
    }

    const entry = this.domains.get(domain);
    if (!entry) {
      return { kind: 'unknown-command', name: domain };
    }

    if (action === undefined) {
      return {
        kind: 'text',
        text: [entry.help, align(commandsToHelp(entry.commands))].join('\n'),
      };
    }

    const command = entry.commands[action];
    if (!command) {
      return { kind: 'unknown-command', name: `${domain} ${action}` };
    }

    return command.run({ monitor, args });
  }
}

/** Sorted by name: the help must not depend on registration order. */
function domainsToHelp(domains: Map<string, Domain>): Array<[string, string]> {
  return [...domains.entries()]
    .map(([name, domain]): [string, string] => [name, domain.help])
    .sort(([a], [b]) => a.localeCompare(b));
}

function commandsToHelp(commands: CommandTable): Array<[string, string]> {
  return Object.entries(commands)
    .map(([name, command]): [string, string] => [name, command.help])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** `  name  help` lines, names padded to the widest of the list. */
function align(entries: Array<[string, string]>): string {
  const width = Math.max(0, ...entries.map(([name]) => name.length));

  return entries
    .map(([name, help]) => `  ${name.padEnd(width)}  ${help}`.trimEnd())
    .join('\n');
}
