// Runtime state, unlike config: not synced between machines and contains no theme.
// A new parameter is one line here; key order = order in the file.
import type { Values } from '@lib/config/derive';
import type { ChoiceSpec, Node } from '@lib/config/leaf';
import type { Field } from '@lib/fields';
import { fields } from '@lib/fields';
import type { Store } from '@lib/store';
import type { CavaMode } from '@ui/MCava';
import { isCavaMode } from '@ui/MCava';

const CAVA_SCHEMA: ChoiceSpec<CavaMode> = {
  kind: 'choice',
  options: ['bars', 'wave-cubic', 'wave-line-to'] as CavaMode[],
  label: 'Cava Mode',
  default: 'bars',
  normalize: (raw) => {
    if (!isCavaMode(raw)) {
      return 'bars';
    }

    return raw;
  },
};

export const STATE_SCHEMA = {
  inhibit: {
    kind: 'bool',
    default: false,
    label: 'Idle inhibitor',
  },
  cavaMode: CAVA_SCHEMA,
} satisfies Node;

/** Static state type: everything else relies on it. */
export type StateValues = Values<typeof STATE_SCHEMA>;

export type State = Store<typeof STATE_SCHEMA>;

/** State form fields in schema order. */
export const stateFields = (state: State): Field[] =>
  fields(state, STATE_SCHEMA);
