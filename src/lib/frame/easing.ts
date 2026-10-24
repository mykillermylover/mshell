/** Лёгкий «перелёт» при примагничивании; чистая функция для тестов. */
export function easeOutBack(t: number): number {
  return 1 + 3 * Math.pow(t - 1, 3) + 2 * Math.pow(t - 1, 2);
}
