import AstalHyprland from 'gi://AstalHyprland';

const hyprlandDefault =
  AstalHyprland.get_default() as AstalHyprland.Hyprland & {
    focus_workspace: (id: number) => void;
  };

hyprlandDefault.focus_workspace = (id: number) => {
  hyprlandDefault.dispatch(`hl.dsp.focus({ workspace = "${id}" })`, '');
};

export const Hyprland = hyprlandDefault;
