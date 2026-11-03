import { Gdk } from 'ags/gtk4';

export type CursorName =
  | 'none'
  | 'default'
  | 'help'
  | 'pointer'
  | 'context-menu'
  | 'progress'
  | 'wait'
  | 'cell'
  | 'crosshair'
  | 'text'
  | 'vertical-text'
  | 'alias'
  | 'copy'
  | 'no-drop'
  | 'move'
  | 'not-allowed'
  | 'grab'
  | 'grabbing'
  | 'zoom-in'
  | 'zoom-out';

export function cursor(name: CursorName): Gdk.Cursor {
  return Gdk.Cursor.new_from_name(name, null);
}
