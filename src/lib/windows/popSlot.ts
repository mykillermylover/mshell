import type { Rect } from '@lib/geometry';
import { MRevealer } from '@ui/MRevealer';
import { Gtk } from 'ags/gtk4';

import type { Edge, PopLayout } from './popLayout';
import { boundsOf } from './widgets';

// The popover slides away from its edge, the zone - toward the edge. One source for both Revealers.
const SLIDE = {
  top: {
    pop: Gtk.RevealerTransitionType.SLIDE_DOWN,
    zone: Gtk.RevealerTransitionType.SLIDE_UP,
  },
  bottom: {
    pop: Gtk.RevealerTransitionType.SLIDE_UP,
    zone: Gtk.RevealerTransitionType.SLIDE_DOWN,
  },
  left: {
    pop: Gtk.RevealerTransitionType.SLIDE_RIGHT,
    zone: Gtk.RevealerTransitionType.SLIDE_LEFT,
  },
  right: {
    pop: Gtk.RevealerTransitionType.SLIDE_LEFT,
    zone: Gtk.RevealerTransitionType.SLIDE_RIGHT,
  },
};

const ALIGN = {
  start: Gtk.Align.START,
  center: Gtk.Align.CENTER,
  end: Gtk.Align.END,
};

const ORIENTATION = {
  vertical: Gtk.Orientation.VERTICAL,
  horizontal: Gtk.Orientation.HORIZONTAL,
};

/** Filler content: an empty zone/spacer behaves like regular content. */
const filler = () => {
  const box = new Gtk.Box();
  box.hexpand = true;
  box.vexpand = true;
  return box;
};

/** Main popover Revealer; the edge sets the direction. */
export function buildPopRevealer(edge: Edge, revealChild = false): MRevealer {
  return new MRevealer({ transitionType: SLIDE[edge].pop, revealChild });
}

interface HoverSlot {
  content: Gtk.Widget | null;
  hideOnReveal: boolean;
}

interface PopSlotOptions {
  edge: Edge;
  layout: PopLayout;
  revealer: MRevealer;
  content: Gtk.Widget;
  hover: HoverSlot | null;
}

/** GTK part of the popover: layout, zone and widget geometry. */
export interface PopSlot {
  readonly widget: Gtk.Box;
  readonly animating: boolean;
  /** The main Revealer is fully revealed. */
  readonly revealed: boolean;
  /** Revealer of the hover zone; null if there is no zone. */
  readonly zoneRevealer: MRevealer | null;
  bounds(relativeTo: Gtk.Widget): Rect | null;
  apply(duration: number, layout: PopLayout): void;
  cleanup(): void;
}

/**
 * Build the slot: Revealer at the inner edge, hover zone at the far edge and
 * a spacer with the frame strip. Here only GTK widgets and subscriptions; the hover
 * controller is one per frame, geometry is computed by Pop.
 */
export function buildPopSlot(options: PopSlotOptions): PopSlot {
  const { edge, layout, revealer, content, hover } = options;
  const widget = new Gtk.Box();
  let spacer: Gtk.Box | null = null;
  let zone: Gtk.Box | null = null;
  let zoneRevealer: MRevealer | null = null;
  let spacerFiller: Gtk.Box | null = null;
  let zoneFiller: Gtk.Box | null = null;

  revealer.set_child(content);

  if (hover) {
    // The frame strip as part of the body: a spacer, not a margin.
    spacer = new Gtk.Box();
    spacerFiller = filler();
    spacer.append(spacerFiller);

    zone = new Gtk.Box();
    if (hover.content) {
      zone.append(hover.content);
    } else {
      zoneFiller = filler();
      zone.append(zoneFiller);
    }

    zoneRevealer = new MRevealer({
      transitionType: SLIDE[edge].zone,
      revealChild: true,
    });
    zoneRevealer.set_child(zone);
  }

  const parts = { spacer, revealer, zone: zoneRevealer };
  for (const part of layout.children) {
    const child = parts[part];
    if (child) {
      widget.append(child);
    }
  }

  let syncId = 0;
  if (hover && zoneRevealer) {
    // hideOnReveal: the zone slides out as soon as opening starts (SLIDE, without
    // fade) and returns as closing starts.
    const zoneRev = zoneRevealer;
    const sync = () => {
      zoneRev.reveal_child = hover.hideOnReveal ? !revealer.reveal_child : true;
    };
    syncId = revealer.connect('notify::reveal-child', sync);
    sync();
  }

  const apply = (duration: number, next: PopLayout) => {
    revealer.transitionDuration = duration;
    if (zoneRevealer) {
      zoneRevealer.transitionDuration = duration;
    }

    widget.orientation = ORIENTATION[next.orientation];
    widget.halign = ALIGN[next.anchor.halign];
    widget.valign = ALIGN[next.anchor.valign];
    widget.marginStart = next.anchor.marginStart;
    widget.marginEnd = next.anchor.marginEnd;
    widget.marginTop = next.anchor.marginTop;
    widget.marginBottom = next.anchor.marginBottom;

    spacer?.set_size_request(
      next.spacer.widthRequest,
      next.spacer.heightRequest,
    );
    spacerFiller?.set_size_request(
      next.spacer.widthRequest,
      next.spacer.heightRequest,
    );
    zone?.set_size_request(next.zone.widthRequest, next.zone.heightRequest);
    zoneFiller?.set_size_request(
      next.zone.widthRequest,
      next.zone.heightRequest,
    );
  };

  return {
    widget,
    get animating() {
      const popup = revealer.reveal_child !== revealer.child_revealed;
      const zoneAnimating =
        zoneRevealer !== null &&
        zoneRevealer.reveal_child !== zoneRevealer.child_revealed;
      return popup || zoneAnimating;
    },
    get revealed() {
      return revealer.child_revealed;
    },
    zoneRevealer,
    bounds: (relativeTo) => boundsOf(widget, relativeTo),
    apply,
    cleanup: () => {
      if (syncId !== 0) {
        revealer.disconnect(syncId);
      }
    },
  };
}
