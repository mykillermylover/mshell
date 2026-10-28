// Хаб плееров: список обёрток, приоритет по правилам priority.ts, ручной выбор.
// Модульный инстанс создаётся один раз; consumers берут `players`.
import { type Accessor, createBinding, createComputed, createState } from 'ags';
import AstalMpris from 'gi://AstalMpris';

import { initial, type Peer, step } from './priority';
import { type Player, wrap } from './proxy';

const isPlaying = (status: AstalMpris.PlaybackStatus) =>
  status === AstalMpris.PlaybackStatus.PLAYING;

export class Mpris {
  static #instance: Mpris | null = null;

  static get_default(): Mpris {
    if (!Mpris.#instance) {
      Mpris.#instance = new Mpris(AstalMpris.get_default());
    }

    return Mpris.#instance;
  }

  /** Обёртки по исходному объекту: один плеер — один Player. */
  #cache = new WeakMap<AstalMpris.Player, Player>();

  /** Все плееры, видимые Astal, по возрастанию busName. */
  readonly list: Accessor<Player[]>;

  /** Приоритетный по правилам автомата. */
  readonly primary: Accessor<Player | null>;

  /** Ручной выбор, пока плеер жив; иначе приоритетный. */
  readonly selected: Accessor<Player | null>;

  /** Зафиксировать выбор; null — вернуть авто. */
  readonly select: (busName: string | null) => void;

  private constructor(mpris: AstalMpris.Mpris) {
    const raw = createBinding(mpris, 'players');

    const wrapCached = (p: AstalMpris.Player): Player => {
      let w = this.#cache.get(p);
      if (!w) {
        w = wrap(p);
        this.#cache.set(p, w);
      }
      return w;
    };

    this.list = createComputed(() =>
      raw()
        .map(wrapCached)
        .sort((a, b) => a.busName.peek().localeCompare(b.busName.peek())),
    );

    // Состояние автомата живёт в замыкании computed: пересчёт только при
    // смене состава или playbackStatus/available, но не на тик позиции.
    let state = initial();
    this.primary = createComputed(() => {
      const all = this.list();
      const peers: Peer[] = all.map((p) => ({
        busName: p.busName.peek(),
        playing: isPlaying(p.playbackStatus()),
        available: p.available(),
      }));

      state = step(state, peers);

      return all.find((p) => p.busName.peek() === state.primary) ?? null;
    });

    const [chosen, setChosen] = createState<string | null>(null);
    this.select = setChosen;

    this.selected = createComputed(() => {
      const want = chosen();
      const all = this.list();

      if (want) {
        const found = all.find((p) => p.busName.peek() === want);
        if (found) {
          return found;
        }
      }

      return this.primary();
    });
  }
}

export type { Player } from './proxy';
