// Хаб плееров: список обёрток, приоритет по правилам priority.ts, ручной выбор.
// Инстанс один на приложение: consumers берут Mpris.get_default().
import {
  type Accessor,
  createBinding,
  createComputed,
  createState,
  type Setter,
} from 'ags';
import AstalMpris from 'gi://AstalMpris';

import { initial, type Peer, type PriorityState, step } from './priority';
import { type Player, wrap } from './proxy';

const toPeer = (player: AstalMpris.Player): Peer => ({
  busName: player.busName,
  playing: player.playbackStatus === AstalMpris.PlaybackStatus.PLAYING,
  available: player.available,
});

export class Mpris {
  static #instance: Mpris | null = null;

  static get_default(): Mpris {
    if (!Mpris.#instance) {
      Mpris.#instance = new Mpris(AstalMpris.get_default());
    }

    return Mpris.#instance;
  }

  /** Источник событий и данных — AstalMpris, инжектится в конструктор. */
  readonly #source: AstalMpris.Mpris;

  /** Сырые плееры Astal; источник для list. */
  readonly #rawPlayers: Accessor<AstalMpris.Player[]>;

  /** Имя приоритетного плеера — единственный реактивный выход автомата. */
  readonly #primaryName: Accessor<string | null>;
  readonly #setPrimaryName: Setter<string | null>;

  /** Ручной выбор по busName: имя переживает пересоздание объекта плеера. */
  readonly #chosenName: Accessor<string | null>;
  readonly #setChosenName: Setter<string | null>;

  /** Обёртки по исходному объекту: один плеер — один Player. */
  readonly #cache = new WeakMap<AstalMpris.Player, Player>();

  /** id коннектов notify::playback-status по каждому наблюдаемому плееру. */
  readonly #connections = new Map<AstalMpris.Player, number>();

  /** Состояние автомата: двигается событиями, живёт вне gnim. */
  #state: PriorityState = initial();

  /** Все плееры, видимые Astal, по возрастанию busName. */
  readonly list: Accessor<Player[]>;

  /** Приоритетный по правилам автомата. */
  readonly primary: Accessor<Player | null>;

  /** Ручной выбор, пока плеер жив; иначе приоритетный. */
  readonly selected: Accessor<Player | null>;

  private constructor(source: AstalMpris.Mpris) {
    this.#source = source;
    this.#rawPlayers = createBinding(source, 'players');

    [this.#primaryName, this.#setPrimaryName] = createState<string | null>(
      null,
    );
    [this.#chosenName, this.#setChosenName] = createState<string | null>(null);

    this.list = createComputed(() => this.#sortedPlayers());
    this.primary = createComputed(() =>
      this.#playerByName(this.#primaryName()),
    );
    this.selected = createComputed(() => this.#chosenOrPrimary());

    source.connect('player-added', () => this.#sync());
    source.connect('player-closed', (_source, player) => this.#sync(player));

    this.#sync();
  }

  /** Зафиксировать выбор плеера; null — вернуть авто. */
  select(player: Player | null): void {
    if (player === null) {
      this.#setChosenName(null);
      return;
    }

    this.#setChosenName(player.busName.peek());
  }

  #sortedPlayers(): Player[] {
    return this.#rawPlayers()
      .map((player) => this.#wrap(player))
      .sort((a, b) => a.busName.peek().localeCompare(b.busName.peek()));
  }

  #playerByName(busName: string | null): Player | null {
    if (busName === null) {
      return null;
    }

    const found = this.list().find(
      (player) => player.busName.peek() === busName,
    );

    return found ?? null;
  }

  #chosenOrPrimary(): Player | null {
    const chosen = this.#playerByName(this.#chosenName());

    if (chosen !== null) {
      return chosen;
    }

    return this.primary();
  }

  #wrap(player: AstalMpris.Player): Player {
    let wrapped = this.#cache.get(player);

    if (!wrapped) {
      wrapped = wrap(player);
      this.#cache.set(player, wrapped);
    }

    return wrapped;
  }

  // Автомат двигают события, а не чтение: шаг выполняется в момент notify,
  // поэтому переходы не схлопываются, пока primary никто не читает.
  // Нас интересует только playback-status — Astal присваивает его в каждом
  // sync(), так что одно событие на плеер покрывает все изменения.
  #watch(player: AstalMpris.Player): void {
    if (this.#connections.has(player)) {
      return;
    }

    // Обработчик получает первым аргументом источник — оборачиваем, иначе
    // #sync примет плеер за «закрытый» и выбросит его из среза.
    this.#connections.set(
      player,
      player.connect('notify::playback-status', () => this.#sync()),
    );
  }

  #unwatch(player: AstalMpris.Player): void {
    const id = this.#connections.get(player);

    if (id === undefined) {
      return;
    }

    player.disconnect(id);
    this.#connections.delete(player);
  }

  // Закрытый плеер Astal убирает из players уже после сигнала, поэтому
  // payload исключается руками: иначе правило «приоритет исчез» не сработает.
  #sync(closed?: AstalMpris.Player): void {
    const players = this.#source.players.filter((player) => player !== closed);

    for (const player of players) {
      this.#watch(player);
    }

    for (const player of this.#connections.keys()) {
      if (!players.includes(player)) {
        this.#unwatch(player);
      }
    }

    this.#state = step(this.#state, players.map(toPeer));
    this.#setPrimaryName(this.#state.primary);
  }
}

export type { Player } from './proxy';
