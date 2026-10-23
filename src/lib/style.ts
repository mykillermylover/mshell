/**
 * Пользовательский стиль, общий для поля, окон и конфига. Чистый модуль:
 * его типом пользуются и GJS-рендер, и node-тесты.
 */
export interface FieldStyle {
  border: number; // толщина рамки, px
  screenRadius: number; // радиус углов экрана, px (точный)
  windowRadius: number; // радиус углов окон, px (точный)
  // Радиус размытия: σ = blurRadius / 1.35. Чем больше, тем мягче кромка.
  blurRadius: number;
  sharp: number; // крутизна порога; 2.2 даёт край ≈1.5px
  snapReach: number; // дальность магнита: на каком зазоре окно притягивается, px
  snapDuration: number; // длительность твина магнита/выпихивания, мс
  revealDuration: number; // длительность выезда/скрытия Pop и Float, мс
  hoverDepth: number; // толщина губы и input hover-зоны, px
  hoverDelay: number; // задержка открытия hover-попапа, мс
  hideDelay: number; // задержка закрытия после ухода, мс
}
