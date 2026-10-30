// Color variants shared by the library widgets.
//
// The class is the whole mechanism: styles/ui/_variant.scss maps
// `.secondary` / `.tertiary` on a widget root to the `--accent` custom
// properties, and each widget decides what to color with them.
//
// It is a prop rather than a `class` attribute because JSX's `class` REPLACES
// the class list (gnim calls `set_css_classes`), which would drop the widget's
// own base class. This helper appends instead.

export type Variant = 'primary' | 'secondary' | 'tertiary';

/**
 * Add the variant class to a widget that already carries its own.
 *
 * `primary` adds nothing: it is the default the stylesheet already assumes.
 */
export function applyVariant(
  widget: { add_css_class(name: string): void },
  variant: Variant = 'primary',
) {
  if (variant !== 'primary') {
    widget.add_css_class(variant);
  }
}
