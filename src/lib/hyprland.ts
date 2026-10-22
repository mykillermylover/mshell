import AstalHyprland from 'gi://AstalHyprland';

const hyprlandDefault = AstalHyprland.get_default();

export const Hyprland = Object.assign({}, hyprlandDefault, {
  focus_workspace(id: number) {
    hyprlandDefault.dispatch(`hl.dsp.focus({ workspace = "${id}" })`, '');
  },
});
