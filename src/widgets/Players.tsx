import { Mpris, Player } from '@lib/players';
import { glibScheduler } from '@lib/time/glibScheduler';
import { Debounce } from '@lib/time/schedule';
import { useWindowApi } from '@lib/windows/host';
import { describeKey } from '@lib/windows/keyEvent';
import MSlider from '@ui/MSlider';
import { ICONS } from '@widgets/icons';
import { createComputed, createEffect, With } from 'ags';
import AstalMpris from 'gi://AstalMpris';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

interface PlayerProps {
  player: Player;
}

function PlayerControlButtons({ player }: PlayerProps) {
  const { previous, next, play_pause, playbackStatus } = player;

  return (
    <box orientation={Gtk.Orientation.HORIZONTAL} halign={Gtk.Align.CENTER}>
      <button onClicked={() => previous()}>
        <image iconName={ICONS.media.backward} />
      </button>
      <button onClicked={() => play_pause()}>
        <image
          iconName={playbackStatus((status) => {
            switch (status) {
              case AstalMpris.PlaybackStatus.STOPPED:
              case AstalMpris.PlaybackStatus.PAUSED: {
                return ICONS.media.play;
              }
              case AstalMpris.PlaybackStatus.PLAYING: {
                return ICONS.media.pause;
              }
            }
          })}
        />
      </button>
      <button onClicked={() => next()}>
        <image iconName={ICONS.media.forward} />
      </button>
    </box>
  );
}

function Player({ player }: PlayerProps) {
  const { artist, albumArtist, coverArt, artUrl, title } = player;

  const artistStr = createComputed(() =>
    artist() === albumArtist() ? artist() : `${artist()} (${albumArtist()})`,
  );

  const coverLink = createComputed(() =>
    coverArt() ? `file:${coverArt()}` : artUrl(),
  );

  const label = createComputed(() => `${artistStr()} - ${title()}`);

  const getTime = (sec: number): string => {
    const minutes = Math.floor(sec / 60).toString();
    const seconds = Math.floor(sec % 60).toString();

    return `${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
  };

  const timePassed = createComputed(() => {
    return getTime(player.position());
  });

  const debouncer = new Debounce(300, glibScheduler);

  return (
    <box orientation={Gtk.Orientation.VERTICAL} widthRequest={400}>
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
      <label label={label} css={'color: var(--primary);'} />
      <PlayerControlButtons player={player} />
      <box>
        <label label={'00:00'} />
        <MSlider
          tooltipText={timePassed}
          hexpand
          cursor={Gdk.Cursor.new_from_name('pointer', null)}
          max={player.length.as((l) => Math.max(l, 0))}
          value={player.position.as((p) => Math.max(p, 0))}
          onChangeValue={({ value }) => {
            debouncer.schedule(() => player.position.set(value));
          }}
        />
        <label label={player.length.as((l) => getTime(l))} />
      </box>
    </box>
  );
}

export default function Players() {
  const mpris = Mpris.get_default();

  const { onKeyPressed, onKeyReleased, hovered, opened } = useWindowApi();

  const primaryPlayer = mpris.primary;

  const keyHolds = new Set<number>();

  onKeyPressed((event) => {
    const { space, tab } = describeKey(event);

    if (space && !keyHolds.has(event.keyval)) {
      primaryPlayer?.peek()?.play_pause();
    }

    keyHolds.add(event.keyval);

    if (tab) {
      return true;
    }
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
