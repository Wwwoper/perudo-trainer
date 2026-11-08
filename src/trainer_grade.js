// trainer_grade.js — единое правило верного ответа в Тренажёре. Чистый модуль: без DOM.
//
// Правило:
//  1. Если есть ход, проходящий порог, верен любой такой ход.
//     «Не верю» проходит порог, когда ставка соперника верна реже порога;
//     повышение проходит, когда ваша ставка верна не реже порога.
//  2. Если проходящих ходов нет, верен ход с наибольшим шансом успеха
//     (у «Не верю» это шанс, что проверка сработает, у повышения — шанс, что ваша ставка верна).
//  3. Если выбран другой ход, разбор называет верный.

import { legal } from './rules.js';

const EPS = 1e-9;

/** Допустимое повышение с наибольшим шансом (при равных — с большим количеством). null, если повышать нельзя. */
export function bestChanceRaise(bid, total, hand, wild, probBid) {
  const rules = { wild: wild !== false };
  let best = null;
  for (let q = 1; q <= total; q++) {
    for (let f = 1; f <= 6; f++) {
      if (!legal(q, f, bid, rules)) continue;
      const p = probBid(q, f, total, hand, rules.wild);
      if (!best || p > best.p + EPS || (Math.abs(p - best.p) <= EPS && q > best.q)) best = { q, f, p };
    }
  }
  return best;
}

/**
 * @param {{bid:{q:number,f:number}, total:number, hand:number[], wild?:boolean, threshold?:number,
 *          probBid:Function, choice:{type:'dudo'}|{type:'raise',q:number,f:number}}} s
 * @returns {{good:boolean, noGoodMove:boolean, chosenSuccess:number,
 *            best:{type:'dudo'|'raise', q?:number, f?:number, success:number}}}
 *   best — верный ход: при выборе, прошедшем порог, это он сам; иначе тот, что надо было выбрать
 */
export function gradeMove({ bid, total, hand, wild = true, threshold = 0.5, probBid, choice }) {
  if (typeof probBid !== 'function') throw new TypeError('gradeMove: нужна функция probBid');
  const thr = Number.isFinite(threshold) ? threshold : 0.5;
  const pBid = probBid(bid.q, bid.f, total, hand, wild);
  const dudo = { type: 'dudo', success: 1 - pBid, passes: pBid < thr };

  // повышения: самое сильное по шансу и (если есть) самое сильное из проходящих порог
  const top = bestChanceRaise(bid, total, hand, wild, probBid);
  const raiseTop = top && { type: 'raise', q: top.q, f: top.f, success: top.p, passes: top.p >= thr };

  const passing = [dudo, raiseTop].filter((o) => o && o.passes);
  const noGoodMove = passing.length === 0;
  const pool = noGoodMove ? [dudo, raiseTop].filter(Boolean) : passing;
  const best = pool.reduce((a, b) => (b.success > a.success + EPS ? b : a));

  const chosen = choice.type === 'dudo'
    ? dudo
    : { type: 'raise', q: choice.q, f: choice.f, success: probBid(choice.q, choice.f, total, hand, wild) };
  const chosenPasses = choice.type === 'dudo' ? dudo.passes : chosen.success >= thr;
  const good = noGoodMove ? chosen.success >= best.success - EPS : chosenPasses;

  const { passes: _p, ...bestOut } = best;
  return { good, noGoodMove, chosenSuccess: chosen.success, best: bestOut };
}
