import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export interface FilePickerParams {
  title?: string;
  name?: string;
  mimeTypes?: readonly string[];
  suffixes?: readonly string[];
}

export default async function pickFile({
  title,
  name,
  mimeTypes,
  suffixes,
}: FilePickerParams): Promise<Gio.File | null> {
  const filter = Gtk.FileFilter.new();

  if (name) {
    filter.set_name(name);
  }
  if (mimeTypes) {
    filter.add_mime_types([...mimeTypes]);
  }
  if (suffixes) {
    for (const suffix of suffixes) {
      filter.add_suffix(suffix);
    }
  }

  const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
  filters.append(filter);

  const dialog = new Gtk.FileDialog({
    title: title ?? name,
    modal: true,
    filters,
    defaultFilter: filter,
  });

  // GJS does not promisify Gtk.FileDialog: the callback form is the only one.
  return new Promise((resolve) => {
    dialog.open(null, null, (_dialog, result) => {
      try {
        resolve(dialog.open_finish(result) ?? null);
      } catch {
        resolve(null); // the user dismissed the dialog
      }
    });
  });
}
