import { state } from '@lib/state/app';
import { useWindowApi } from '@lib/windows/host';
import { MCava } from '@ui/cava';
import { MAnimatedContainer } from '@ui/MAnimatedContainer';
import { ICONS } from '@widgets/icons';
import { onCleanup, With } from 'ags';
import AstalCava from 'gi://AstalCava';

export default function MediaHover() {
  const { opened } = useWindowApi();

  const cava = AstalCava.get_default()!;

  const { cavaMode } = state;

  const syncCavaMode = () => {
    cava.bars = cavaMode.peek() === 'wave-line-to' ? 100 : 20;
  };

  const cavaUnsub = cavaMode.subscribe(() => {
    syncCavaMode();
  });
  syncCavaMode();

  onCleanup(() => {
    cavaUnsub();
  });

  return (
    <MAnimatedContainer class="hover-row" hexpand>
      <With value={opened}>
        {(opened) => (
          <box spacing={8} heightRequest={opened ? 100 : undefined}>
            <image
              pixelSize={opened ? undefined : 12}
              iconName={ICONS.media.play}
            />
            <MCava
              cava={cava}
              hexpand
              minBarHeight={2}
              sag={0.25}
              mode={cavaMode}
              vexpand
            />
          </box>
        )}
      </With>
    </MAnimatedContainer>
  );
}
