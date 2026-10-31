import { Mpris, Player } from '@lib/players';
import { state } from '@lib/state/app';
import { createExtrapolated } from '@lib/time/extrapolated';
import { glibScheduler } from '@lib/time/glibScheduler';
import { Debounce } from '@lib/time/schedule';
import { useWindowApi } from '@lib/windows/host';
import { describeKey } from '@lib/windows/keyEvent';
import { MAnimatedContainer } from '@ui/MAnimatedContainer';
import { MCava } from '@ui/MCava';
import MMediaSlider from '@ui/slider/MMediaSlider';
import { ICONS } from '@widgets/icons';
import { createComputed, createEffect, With } from 'ags';
import AstalCava from 'gi://AstalCava';
import AstalMpris from 'gi://AstalMpris';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

interface PlayerProps {
  player: Player;
}

/** How often the extrapolated playhead is recomputed, ms. */
const POSITION_REFRESH_MS = 100;

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

const getTime = (sec: number): string => {
  const minutes = Math.floor(sec / 60).toString();
  const seconds = Math.floor(sec % 60).toString();

  return `${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
};

function Player({ player }: PlayerProps) {
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

  position.subscribe(() => {
    updatePosition(position.peek());
  });

  const positionDebouncer = new Debounce(300, glibScheduler);

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
      <label label={label} css={'color: var(--primary);'} />
      <PlayerControlButtons player={player} />
      <box>
        <label label={'00:00'} />
        <MMediaSlider
          tooltipText={timePassed}
          hexpand
          playing={playing}
          cursor={Gdk.Cursor.new_from_name('pointer', null)}
          max={player.length.as((l) => Math.max(l, 0))}
          value={shownPosition((p) =>
            Math.min(Math.max(p, 0), player.length.peek()),
          )}
          onChangeValue={({ value }) => {
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

export function PlayerHover() {
  const { opened } = useWindowApi();

  const cava = AstalCava.get_default()!;

  const { cavaMode } = state;

  return (
    <MAnimatedContainer class="hover-row" hexpand>
      <With value={opened}>
        {(opened) => (
          <box spacing={8} heightRequest={opened ? 100 : undefined}>
            <image
              iconName={ICONS.media.play}
              css={opened ? undefined : '-gtk-icon-size: 12px;'}
            />
            <MCava
              cava={cava}
              hexpand
              minBarHeight={2}
              sag={0.25}
              mode={cavaMode}
              vexpand
              css={'color: var(--tertiary);'}
            />
          </box>
        )}
      </With>
    </MAnimatedContainer>
  );
}
