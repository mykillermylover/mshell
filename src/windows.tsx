import type { FloatSpec, PopSpec } from '@lib/windows/spec';
import Players, { PlayerHover } from '@widgets/Players';
import Settings from '@widgets/Settings';
import Workspaces from '@widgets/Workspaces';

/** Initial popovers: created synchronously on init of each frame. */
export const INITIAL_POPS: PopSpec[] = [
  {
    id: 'player',
    edge: 'top',
    hover: { content: PlayerHover, hideOnReveal: false },
    content: Players,
    keyboard: true,
  },
  {
    id: 'settings',
    edge: 'right',
    hover: { reserve: true },
    keyboard: true,
    content: () => <Settings />,
  },
  {
    id: 'workspaces',
    edge: 'top',
    align: 'start',
    exclusive: false,
    hover: {
      hideOnReveal: true,
      content: () => <box heightRequest={2} />,
    },
    offsetX: 60,
    content: () => <Workspaces />,
  },
];

/** Initial Floats: created synchronously; dynamic ones - via Frame.addFloat. */
export const INITIAL_FLOATS: FloatSpec[] = [
  // {
  //   id: 'notes',
  //   header: () => <_FloatHeader title="Notes" />,
  //   x: 200,
  //   y: 260,
  //   content: _Notes,
  // },
  // {
  //   id: 'mixer',
  //   header: () => <_FloatHeader title="Mixer" />,
  //   x: 560,
  //   y: 340,
  //   content: _Mixer,
  // },
];
