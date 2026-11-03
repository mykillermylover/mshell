import type { MaybeAccessor } from '@lib/reactive';
import { asAccessor, findController } from '@lib/reactive';
import { createComputed } from 'ags';
import { Gtk } from 'ags/gtk4';

type MSwitchProps = JSX.IntrinsicElements['switch'] & {
  /**
   * Icons on the knob: `true` shows a cross when off and a check when on,
   * `'only-selected'` shows only the check, and the off knob keeps its
   * plain 16dp size.
   */
  showIcons?: MaybeAccessor<boolean | 'only-selected'>;
};

const DEFAULT_SWITCH_CLASS = 'mswitch';

/**
 * Toggle at the start of the animation, not at its end.
 *
 * GtkSwitch runs its own 100ms slide and flips `:checked` only when that
 * slide ends, so the M3 colors would trail the knob by 100ms. But
 * `gtk_switch_set_active` begins with `gtk_switch_end_toggle_animation`, so
 * calling it here kills the slide: the state flips at once and the
 * stylesheet owns the motion (300ms, with the M3 overshoot).
 *
 * The click gesture is GTK's own - the same one it toggles from. GTK
 * connects its `released` handler in its init, so it runs first and starts
 * its 100ms slide; the `set_active` below then ends that slide and flips
 * the state at once.
 */
const attachToggle = (self: Gtk.Switch) => {
  /** Matches the knob travel in _switch.scss; the class is dropped after it. */
  const SWITCHING_MS = 300;

  let switchingTimer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (switchingTimer !== null) {
      clearTimeout(switchingTimer);
      switchingTimer = null;
    }
  };

  const toggle = () => {
    // With animations off GtkSwitch flips synchronously in its own handler,
    // which runs first (the class closure for `activate`, the gesture's
    // handler for `released`). Flipping here would undo that flip and the
    // switch would ignore clicks. GTK already has it handled.
    if (Gtk.Settings.get_default()?.gtkEnableAnimations !== true) {
      return;
    }

    // The stylesheet animates the knob only under `.switching`: on mount the
    // state is already known and nothing should travel. The class also hides
    // the halo - a box-shadow on the knob leaves a seam while the animated
    // margins resize it - so it has to come back once the travel is over.
    self.add_css_class('switching');

    stopTimer();

    switchingTimer = setTimeout(() => {
      self.remove_css_class('switching');
      switchingTimer = null;
    }, SWITCHING_MS);

    self.active = !self.get_active();
  };

  // A release outside the widget is not an activation for GTK either;
  // gtk_switch_click_gesture_released checks the same thing.
  findController(self, Gtk.GestureClick)?.connect(
    'released',
    (_gesture, _nPress, x: number, y: number) => {
      if (self.contains(x, y)) {
        toggle();
      }
    },
  );

  // Space and Enter go through `activate`, never through the click gesture.
  self.connect('activate', toggle);

  // The timer holds `self`, and a switch can be unmounted mid-travel.
  self.connect('destroy', stopTimer);
};

export default function MSwitch(props: MSwitchProps) {
  const { showIcons, cssClasses, ...rest } = props;

  const cssClassesAccessor = asAccessor(cssClasses ?? []);
  const iconsAccessor = asAccessor(showIcons);

  const classes = createComputed(() => {
    const classesSet = new Set(cssClassesAccessor());
    classesSet.add(DEFAULT_SWITCH_CLASS);

    const icons = iconsAccessor();

    if (icons === true) {
      classesSet.add('icons');
    } else if (icons === 'only-selected') {
      classesSet.add('only-selected');
    }

    return [...classesSet];
  });

  return <switch {...rest} cssClasses={classes} $={attachToggle} />;
}
