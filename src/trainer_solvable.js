// trainer_solvable.js — есть ли в ситуации Тренажёра ход, проходящий порог. Чистый модуль: без DOM.
//
// Ситуация без такого хода учит неверному: «Не верю» ошибочно (ставка верна не реже порога),
// а любое повышение ниже порога. Генератор такие расклады отбрасывает.

import { compareOptions } from './compare.js';

/**
 * @param {{bid: {q:number,f:number}, total: number, hand: number[], wild?: boolean,
 *          threshold?: number, probBid: Function}} s
 * @returns {boolean} true, если «Не верю» или хоть одно допустимое повышение проходит порог
 */
export function hasGoodMove(s) {
  const { options } = compareOptions(s);
  return options.some((o) => o.meetsThreshold);
}

/**
 * Подбирает ситуацию, где есть ход, проходящий порог.
 * @param {() => object} make создаёт случайную ситуацию { n, h, f, q }
 * @param {(sit: object) => boolean} ok проверка ситуации
 * @param {number} [tries] сколько раз пробовать
 * @returns {object} подходящая ситуация, а если за tries попыток не нашлась — последняя (ход не блокируется)
 */
export function pickSolvable(make, ok, tries = 30) {
  let sit = make();
  for (let i = 1; i < tries && !ok(sit); i++) sit = make();
  return sit;
}
