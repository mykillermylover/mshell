// A key event in words: pure logic, no GJS, so it is tested in node.
// The values are the X11 keysyms GDK passes in `keyval`; they are duplicated
// here because `gi://Gdk` cannot be imported from a node test. They match
// `Gdk.KEY_*` - the cava name check below is the only place to keep in sync.
import type { KeyEvent } from './keyHandlers';

/** X11 keysyms used by `describeKey`, named as `Gdk.KEY_*` without the prefix. */
export const KEYS = {
  escape: 0xff_1b,
  tab: 0xff_09,
  enter: 0xff_0d,
  kpEnter: 0xff_8d,
  backspace: 0xff_08,
  delete: 0xff_ff,
  insert: 0xff_63,
  space: 0x00_20,
  up: 0xff_52,
  down: 0xff_54,
  left: 0xff_51,
  right: 0xff_53,
  home: 0xff_50,
  end: 0xff_57,
  pageUp: 0xff_55,
  pageDown: 0xff_56,
  shiftL: 0xff_e1,
  shiftR: 0xff_e2,
  ctrlL: 0xff_e3,
  ctrlR: 0xff_e4,
  altL: 0xff_e9,
  altR: 0xff_ea,
  superL: 0xff_eb,
  superR: 0xff_ec,
  f1: 0xff_be,
  f12: 0xff_c9,
  a: 0x61,
  c: 0x63,
} as const;

const F_KEYS: ReadonlyMap<number, number> = new Map(
  Array.from({ length: 12 }, (_, i) => [KEYS.f1 + i, i + 1]),
);

const CONTROL = 4;
const SHIFT = 1;
const ALT = 8;
const SUPER = 67_108_864;

/**
 * A key press in human terms: `key` keeps the raw keyval (compare it with
 * `Gdk.KEY_*`), the flags say which key it is, and the modifiers are read from
 * the state mask. A modifier pressed on its own is also reported per side;
 * a modifier *held* during another key does not say its side.
 */
export interface KeyInfo {
  /** Raw keyval, as `Gdk.KEY_*`. */
  key: number;
  escape: boolean;
  space: boolean;
  enter: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  insert: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  home: boolean;
  end: boolean;
  pageUp: boolean;
  pageDown: boolean;
  /** Function key number, 1..12; `null` for any other key. */
  f: number | null;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  super: boolean;
  shiftLeft: boolean;
  shiftRight: boolean;
  ctrlLeft: boolean;
  ctrlRight: boolean;
  altLeft: boolean;
  altRight: boolean;
  superLeft: boolean;
  superRight: boolean;
}

export function describeKey(event: KeyEvent): KeyInfo {
  const { keyval: key, state } = event;
  const held = (mask: number) => (state & mask) !== 0;

  return {
    key,
    escape: key === KEYS.escape,
    space: key === KEYS.space,
    enter: key === KEYS.enter || key === KEYS.kpEnter,
    tab: key === KEYS.tab,
    backspace: key === KEYS.backspace,
    delete: key === KEYS.delete,
    insert: key === KEYS.insert,
    up: key === KEYS.up,
    down: key === KEYS.down,
    left: key === KEYS.left,
    right: key === KEYS.right,
    home: key === KEYS.home,
    end: key === KEYS.end,
    pageUp: key === KEYS.pageUp,
    pageDown: key === KEYS.pageDown,
    f: F_KEYS.get(key) ?? null,
    shift: held(SHIFT),
    ctrl: held(CONTROL),
    alt: held(ALT),
    super: held(SUPER),
    shiftLeft: key === KEYS.shiftL,
    shiftRight: key === KEYS.shiftR,
    ctrlLeft: key === KEYS.ctrlL,
    ctrlRight: key === KEYS.ctrlR,
    altLeft: key === KEYS.altL,
    altRight: key === KEYS.altR,
    superLeft: key === KEYS.superL,
    superRight: key === KEYS.superR,
  };
}
