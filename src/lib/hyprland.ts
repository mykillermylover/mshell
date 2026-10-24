import AstalHyprland from 'gi://AstalHyprland';

export function focusWorkspace(id: number) {
  AstalHyprland.get_default()?.dispatch(
    `hl.dsp.focus({ workspace = "${id}" })`,
    '',
  );
}
