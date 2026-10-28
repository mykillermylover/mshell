// Автомат выбора приоритетного плеера. Ни одного импорта: файл грузится
// в Node (tsx) ради тестов, а gi:// там недоступен.
//
// Правила (в порядке значимости):
//   1. приоритетный жив и играет → он
//   2. кто-то играет             → заигравший последним
//   3. приоритетный жив          → он
//   4. иначе                     → первый по имени
// Пауза и стоп неразличимы: на вход приходит boolean.

export interface Peer {
  busName: string;
  playing: boolean;
  available: boolean;
}

export interface PriorityState {
  /** Итог прошлого шага. */
  primary: string | null;
  /** Кто играл на прошлом шаге — чтобы отличить «заиграл» от «уже играл». */
  playing: string[];
  /** Стек «заиграл»: последний заигравший в конце. */
  started: string[];
}

export function initial(): PriorityState {
  return { primary: null, playing: [], started: [] };
}

/**
 * Один шаг автомата. Чистая функция: возвращает новое состояние, вход не мутирует.
 * Повторный вызов с теми же peers идемпотентен — иначе notify о перестановке
 * в HashTable из AstalMpris рождал бы ложные события «заиграл».
 */
export function step(state: PriorityState, peers: Peer[]): PriorityState {
  const present = new Set(peers.map((p) => p.busName));

  // 1. Исчезнувшие плееры уходят из стека и из «играли».
  const started = state.started.filter((name) => present.has(name));
  const before = new Set(state.playing.filter((name) => present.has(name)));

  // Играющих держим отсортированными: порядок входа не должен влиять на результат.
  const nowPlaying = peers
    .filter((p) => p.available && p.playing)
    .map((p) => p.busName)
    .sort();

  // 2. Новые играющие — наверх стека.
  for (const name of nowPlaying) {
    if (before.has(name)) {
      continue;
    }

    const at = started.indexOf(name);

    if (at !== -1) {
      started.splice(at, 1);
    }

    started.push(name);
  }

  const alive = peers
    .filter((p) => p.available)
    .map((p) => p.busName)
    .sort();

  let primary: string | null;
  if (state.primary && nowPlaying.includes(state.primary)) {
    primary = state.primary;
  } else if (nowPlaying.length > 0) {
    const playingSet = new Set(nowPlaying);
    const last = [...started].reverse().find((name) => playingSet.has(name));
    primary = last ?? nowPlaying[0];
  } else if (state.primary && alive.includes(state.primary)) {
    primary = state.primary;
  } else {
    primary = alive[0] ?? null;
  }

  return { primary, playing: nowPlaying, started };
}
