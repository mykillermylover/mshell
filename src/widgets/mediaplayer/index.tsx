import type { Player as MprisPlayer } from '@lib/players';
import { Mpris } from '@lib/players';
import { useWindowApi } from '@lib/windows/host';
import { describeKey } from '@lib/windows/keyEvent';
import { createEffect, With } from 'ags';
import { Gtk } from 'ags/gtk4';

import Player from './Player';

export interface PlayerProps {
  player: MprisPlayer;
}

export default function MediaPlayer() {
  const mpris = Mpris.get_default();

  const { onKeyPressed, onKeyReleased, hovered, opened } = useWindowApi();

  const primaryPlayer = mpris.primary;

  const keyHolds = new Set<number>();

  onKeyPressed((event) => {
    const { space } = describeKey(event);

    if (space && !keyHolds.has(event.keyval)) {
      primaryPlayer?.peek()?.play_pause();
    }

    keyHolds.add(event.keyval);
  });

  onKeyReleased((event) => {
    keyHolds.delete(event.keyval);
  });

  createEffect(() => {
    if (!hovered() || !opened()) {
      keyHolds.clear();
    }
  });

  return (
    <box class={'player'} orientation={Gtk.Orientation.VERTICAL}>
      <With value={mpris.primary}>
        {(player) => (player ? <Player player={player} /> : undefined)}
      </With>
    </box>
  );
}
