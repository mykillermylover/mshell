import { Gtk } from 'ags/gtk4';

import { padded } from './ui';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

/** Окно, выезжающее из края рамки (открывается/закрывается). */
export interface PopSpec {
  id: string;
  edge: Edge;
  align?: 'start' | 'center' | 'end'; // положение вдоль края
  content: () => Gtk.Widget; // вызывается по разу на монитор; фон НЕ задавать
}

const SLIDE = {
  top: Gtk.RevealerTransitionType.SLIDE_DOWN,
  bottom: Gtk.RevealerTransitionType.SLIDE_UP,
  left: Gtk.RevealerTransitionType.SLIDE_RIGHT,
  right: Gtk.RevealerTransitionType.SLIDE_LEFT,
};
const ALIGN = {
  start: Gtk.Align.START,
  center: Gtk.Align.CENTER,
  end: Gtk.Align.END,
};

/**
 * Выдвижной слот рамки: Revealer прижат к внутреннему краю рамки (со стороны
 * edge) и скользит из-за него; вдоль края — по align с отступом от угла.
 */
export class Pop {
  readonly revealer: Gtk.Revealer;

  constructor(
    readonly spec: PopSpec,
    private style: () => {
      border: number;
      screenRadius: number;
      revealDuration: number;
    },
    revealed: () => void,
  ) {
    const { revealDuration } = this.style();
    const revealer = new Gtk.Revealer({
      transitionType: SLIDE[spec.edge],
      transitionDuration: revealDuration,
      revealChild: false,
    });
    revealer.set_child(padded(spec.content()));
    revealer.connect('notify::child-revealed', revealed);
    this.revealer = revealer;
    this.apply();
  }

  /** Переставить слот и обновить длительность по текущему конфигу. */
  apply() {
    const { border, screenRadius, revealDuration } = this.style();
    this.revealer.transitionDuration = revealDuration;

    const along = this.spec.align ?? 'center';
    const offset = border + screenRadius;
    const horizontal = this.spec.edge === 'top' || this.spec.edge === 'bottom';
    const alignment = ALIGN[along];

    // Окно прижато к внутреннему краю рамки; вдоль края — по align.
    if (horizontal) {
      this.revealer.halign = alignment;
      this.revealer.valign =
        this.spec.edge === 'top' ? Gtk.Align.START : Gtk.Align.END;
      if (this.spec.edge === 'top') {
        this.revealer.marginTop = border;
      } else {
        this.revealer.marginBottom = border;
      }
      if (along === 'start') {
        this.revealer.marginStart = offset;
      }
      if (along === 'end') {
        this.revealer.marginEnd = offset;
      }
    } else {
      this.revealer.valign = alignment;
      this.revealer.halign =
        this.spec.edge === 'left' ? Gtk.Align.START : Gtk.Align.END;
      if (this.spec.edge === 'left') {
        this.revealer.marginStart = border;
      } else {
        this.revealer.marginEnd = border;
      }
      if (along === 'start') {
        this.revealer.marginTop = offset;
      }
      if (along === 'end') {
        this.revealer.marginBottom = offset;
      }
    }
  }
}
