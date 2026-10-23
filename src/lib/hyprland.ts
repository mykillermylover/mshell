import { mixin } from '@lib/mixin';
import AstalHyprland from 'gi://AstalHyprland';

const hyprlandDefault = AstalHyprland.get_default();

export const Hyprland = mixin(hyprlandDefault, {
  focus_workspace: (id: number) => {
    hyprlandDefault.dispatch(`hl.dsp.focus({ workspace = "${id}" })`, '');
  },
});
