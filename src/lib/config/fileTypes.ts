/**
 * Rules for one picker filter. Rules inside a single GTK FileFilter are OR'ed:
 * `mimeTypes` is the main criterion (it survives renamed files and bogus
 * suffixes), `suffixes` is the fallback for when the content type cannot be
 * sniffed (network mounts, odd filesystems).
 */
export type FileTypes = {
  name: string;
  mimeTypes: readonly string[];
  suffixes: readonly string[];
};

/**
 * The only filters a schema may reference. GTK reports nothing when a mime
 * type is wrong (`image/jpg` instead of `image/jpeg` simply never matches),
 * so the table is the one place to get them right.
 *
 * Verified against `Gio.content_type_guess` - every suffix here resolves to
 * one of the listed mime types on a system with shared-mime-info.
 */
export const FILE_TYPES = {
  images: {
    name: 'Images',
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/avif',
    ],
    suffixes: [
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'bmp',
      'tiff',
      'tif',
      'avif',
    ],
  },
} as const satisfies Record<string, FileTypes>;

/** Keys of FILE_TYPES only: nothing arbitrary reaches the picker. */
export type FileKind = keyof typeof FILE_TYPES;
