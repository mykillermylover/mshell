import type { MaybeAccessor } from '@lib/reactive';
import { asAccessor } from '@lib/reactive';
import MButton from '@ui/MButton';
import { ICONS } from '@widgets/icons';
import { Gtk } from 'ags/gtk4';
import AstalMpris from 'gi://AstalMpris';

import type { PlayerProps } from './index';

interface ControlButtonProps {
  action: () => void;
  type: 'forward' | 'backward';
}

function ControlButton({ action, type }: ControlButtonProps) {
  const { backward, forward } = ICONS.media;

  return (
    <MButton
      iconName={type === 'backward' ? backward : forward}
      color={'text'}
      onClicked={() => action()}
    />
  );
}

interface PlayPauseProps {
  playbackStatus: MaybeAccessor<AstalMpris.PlaybackStatus>;
  playPause: () => void;
}
function PlayPause({ playbackStatus, playPause }: PlayPauseProps) {
  const pbStatusAccessor = asAccessor(playbackStatus);

  return (
    <MButton
      iconName={pbStatusAccessor((status) => {
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
      color={'text'}
      onClicked={() => playPause()}
    />
  );
}

export default function PlayerControlButtons({ player }: PlayerProps) {
  const { previous, next, play_pause, playbackStatus } = player;

  return (
    <box orientation={Gtk.Orientation.HORIZONTAL} halign={Gtk.Align.CENTER}>
      <ControlButton action={previous} type="backward" />
      <PlayPause playbackStatus={playbackStatus} playPause={play_pause} />
      <ControlButton action={next} type="forward" />
    </box>
  );
}
