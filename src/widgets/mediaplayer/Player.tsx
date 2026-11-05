import { createExtrapolated } from '@lib/time/extrapolated';
import { glibScheduler } from '@lib/time/glibScheduler';
import { Debounce } from '@lib/time/schedule';
import MMediaSlider from '@ui/slider/MMediaSlider';
import { cursor } from '@widgets/helpers';
import { createComputed, createState, onCleanup } from 'ags';
import { Gtk } from 'ags/gtk4';
import AstalMpris from 'gi://AstalMpris';

import PlayerControlButtons from './PlayerControls';
import type { PlayerProps } from './index';

/** How often the extrapolated playhead is recomputed, ms. */
const POSITION_REFRESH_MS = 100;

const getTime = (sec: number): string => {
  const minutes = Math.floor(sec / 60).toString();
  const seconds = Math.floor(sec % 60).toString();

  return `${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
};

export default function Player({ player }: PlayerProps) {
  const {
    artist,
    albumArtist,
    coverArt,
    artUrl,
    title,
    playbackStatus,
    position,
  } = player;

  const artistStr = createComputed(() =>
    artist() === albumArtist() ? artist() : `${artist()} (${albumArtist()})`,
  );

  const coverLink = createComputed(() => {
    if (coverArt().includes('data:image')) {
      console.log('coverArt with base64');
    }
    if (artUrl().includes('data:image')) {
      console.log('atUrl with base64');
    }

    return coverArt() ? `file:${coverArt()}` : artUrl();
  });

  const label = createComputed(() => `${artistStr()} - ${title()}`);

  const timePassed = createComputed(() => {
    return getTime(player.position());
  });

  const playing = createComputed(
    () => playbackStatus() === AstalMpris.PlaybackStatus.PLAYING,
  );

  /*
   * MPRIS reports the position about once a second, while the track advances
   * continuously. The playhead is fed an estimate instead: the reported
   * position, kept moving at whatever speed the last two reports imply. The
   * estimate never goes back to MPRIS, so a lagging report cannot fight the
   * user.
   */
  const [shownPosition, updatePosition] = createExtrapolated(position.peek(), {
    refreshMs: POSITION_REFRESH_MS,
    rate: 1,
  });

  const positionUnsub = position.subscribe(() => {
    if (dragging.peek()) {
      return;
    }

    updatePosition(position.peek());
  });

  const positionDebouncer = new Debounce(300, glibScheduler);

  const [dragging, setDragging] = createState(false);

  onCleanup(() => {
    positionUnsub();
  });

  return (
    <box orientation={Gtk.Orientation.VERTICAL} widthRequest={300}>
      <box
        halign={Gtk.Align.CENTER}
        valign={Gtk.Align.CENTER}
        heightRequest={200}
        widthRequest={200}
        css={coverLink(
          (cover) =>
            `background-image: url(${cover}); background-size: cover; border-radius: 8px;`,
        )}
      />
      <label label={label} class={'primary'} />
      <PlayerControlButtons player={player} />
      <box>
        <label label={'00:00'} />
        <MMediaSlider
          onDragStart={() => setDragging(true)}
          onDragEnd={(self) => {
            setDragging(false);
            position.set(self.value);
          }}
          tooltipText={timePassed}
          hexpand
          playing={playing}
          cursor={cursor('pointer')}
          max={player.length.as((l) => Math.max(l, 0))}
          value={shownPosition((p) =>
            Math.min(Math.max(p, 0), player.length.peek()),
          )}
          onChangeValue={({ value }) => {
            if (dragging.peek()) {
              updatePosition(value);
              return;
            }

            positionDebouncer.schedule(() => {
              position.set(value);
            });
          }}
        />
        <label label={player.length.as((l) => getTime(l))} />
      </box>
    </box>
  );
}
