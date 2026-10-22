import { Gtk } from 'ags/gtk4';

import type { Rect } from '../liquid/LiquidField';
import type { Edge, PopLayout } from './popLayout';
import { boundsOf } from './ui';

// Попап уезжает от своего края, зона — к краю. Одно знание на оба Revealer.
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

/** Контент-заполнитель: пустая зона/спейсер ведут себя как обычный контент. */
const filler = () => {
  const box = new Gtk.Box();
  box.hexpand = true;
  box.vexpand = true;
  return box;
};

/** Основной Revealer попапа; направление задаёт край. */
export const buildPopRevealer = (edge: Edge) =>
  new Gtk.Revealer({
    transitionType: SLIDE[edge].pop,
    revealChild: false,
  });

export interface HoverWiring {
  root: Gtk.Widget;
  content: Gtk.Widget | null;
  hideOnReveal: boolean;
  /** Input-область закрытой/открытой зоны: по ней считается enter/leave. */
  bounds(): Rect | null;
  enter(): void;
  leave(): void;
}

export interface PopSlotOptions {
  edge: Edge;
  layout: PopLayout;
  revealer: Gtk.Revealer;
  content: Gtk.Widget;
  hover: HoverWiring | null;
}

/** GTK-часть попапа: раскладка, зона, подписки и геометрия виджета. */
export interface PopSlot {
  readonly widget: Gtk.Box;
  readonly animating: boolean;
  /** Основной Revealer уже полностью раскрыт. */
  readonly revealed: boolean;
  subscribe(fn: () => void): () => void;
  bounds(relativeTo: Gtk.Widget): Rect | null;
  apply(duration: number, layout: PopLayout): void;
}

/**
 * Собрать слот: Revealer у внутренней кромки, hover-зона на дальней и
 * spacer с полосой рамки. Всю GTK-механику держит этот модуль; Pop
 * отдаёт только геометрию и колбэки.
 */
export const buildPopSlot = (options: PopSlotOptions): PopSlot => {
  const { edge, layout, revealer, content, hover } = options;
  const widget = new Gtk.Box();
  let spacer: Gtk.Box | null = null;
  let zone: Gtk.Box | null = null;
  let zoneRevealer: Gtk.Revealer | null = null;
  let spacerFiller: Gtk.Box | null = null;
  let zoneFiller: Gtk.Box | null = null;

  revealer.set_child(content);

  if (hover) {
    // Полоса рамки как часть тела: spacer, а не margin.
    spacer = new Gtk.Box();
    spacerFiller = filler();
    spacer.append(spacerFiller);

    zone = new Gtk.Box();
    zone.add_css_class('hover-zone');
    if (hover.content) {
      zone.append(hover.content);
    } else {
      zoneFiller = filler();
      zone.append(zoneFiller);
    }

    zoneRevealer = new Gtk.Revealer({
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

  if (hover) {
    // Input = тело + полоса рамки, поэтому hover считаем по bounds, а не
    // по enter/leave детей: пустые дети событий не дают.
    let inside = false;
    const check = (x: number, y: number) => {
      const rect = hover.bounds();
      const now =
        rect !== null &&
        x >= rect.x &&
        x < rect.x + rect.w &&
        y >= rect.y &&
        y < rect.y + rect.h;

      if (now === inside) {
        return;
      }

      inside = now;
      if (now) {
        hover.enter();
      } else {
        hover.leave();
      }
    };

    const motion = new Gtk.EventControllerMotion();
    motion.connect(
      'motion',
      (_motion: Gtk.EventControllerMotion, x: number, y: number) => check(x, y),
    );
    motion.connect(
      'enter',
      (_motion: Gtk.EventControllerMotion, x: number, y: number) => check(x, y),
    );
    motion.connect('leave', () => {
      if (inside) {
        inside = false;
        hover.leave();
      }
    });
    hover.root.add_controller(motion);
  }

  if (hover && zoneRevealer) {
    // hideOnReveal: зона уезжает сразу с началом открытия (SLIDE, без
    // fade) и возвращается с началом закрытия.
    const zoneRev = zoneRevealer;
    const sync = () => {
      zoneRev.reveal_child = hover.hideOnReveal ? !revealer.reveal_child : true;
    };
    revealer.connect('notify::reveal-child', sync);
    sync();
  }

  const subscribe = (fn: () => void) => {
    const connections: Array<[Gtk.Revealer, number]> = [];

    for (const target of [revealer, zoneRevealer]) {
      if (!target) {
        continue;
      }
      connections.push(
        [target, target.connect('notify::reveal-child', fn)],
        [target, target.connect('notify::child-revealed', fn)],
      );
    }

    return () => {
      for (const [target, id] of connections) {
        target.disconnect(id);
      }
    };
  };

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
    subscribe,
    bounds: (relativeTo) => boundsOf(widget, relativeTo),
    apply,
  };
};
