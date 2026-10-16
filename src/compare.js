// compare.js — сравнение вариантов хода по шансу ставки.
//
// Модуль чистый: вероятности не считает сам, а получает функцию probBid(q, face, total, hand, wild)
// (в приложении это Perudo.probBid из core.js). Так его можно проверить в Node.
//
// Важно: это сравнение по шансам ставки, а не оценка выигрыша. Шанс проверки («не верю»)
// и шанс своей ставки — разные вещи, поэтому модуль ничего не объявляет «лучшим ходом»:
// он показывает числа, а вывод остаётся за игроком.

import { legal, minLegal } from './rules.js';

const isBid = (b) => b !== null && typeof b === 'object'
  && Number.isInteger(b.q) && b.q >= 1 && Number.isInteger(b.f) && b.f >= 1 && b.f <= 6;

/**
 * Самая сильная безопасная ставка: из допустимых повышений с шансом не ниже порога выбирается
 * то, где больше количество, а при равном количестве — выше шанс.
 * @returns {{q: number, f: number, p: number} | null}
 */
export function bestSafeRaise(bid, n, hand, rules, threshold, probBid) {
  const thr = threshold == null ? 0.5 : threshold;
  const wild = !rules || rules.wild !== false;
  let best = null;
  for (let q = 1; q <= n; q++) {
    for (let f = 1; f <= 6; f++) {
      if (!legal(q, f, bid, rules)) continue;
      const p = probBid(q, f, n, hand, wild);
      if (p >= thr && (!best || q > best.q || (q === best.q && p > best.p))) {
        best = { q, f, p };
      }
    }
  }
  return best;
}

/**
 * Варианты хода перед решением.
 *
 * Каждый вариант: { type, p, success, meetsThreshold, q?, f? }
 *  - type 'dudo': «не верю» ставке соперника. p — шанс, что ставка верна,
 *    success = 1 − p (шанс, что проверка сработает), meetsThreshold: p < порога.
 *  - type 'minRaise': минимальное допустимое повышение. p и success — шанс, что ваша ставка верна,
 *    meetsThreshold: p ≥ порога. Если оно же и самая сильная безопасная ставка, isBestSafe = true.
 *  - type 'safeRaise': самая сильная безопасная ставка (если есть и отличается от минимального повышения).
 *
 * @param {{bid: ({q:number,f:number}|null), total: number, hand: number[], wild?: boolean,
 *          threshold?: number, probBid: Function}} s
 * @returns {{bidP: number|null, options: object[]}}
 */
export function compareOptions({ bid = null, total, hand, wild = true, threshold = 0.5, probBid }) {
  if (typeof probBid !== 'function') throw new TypeError('compareOptions: нужна функция probBid');
  if (!Number.isInteger(total) || total < 1) throw new RangeError('compareOptions: total должно быть целым числом от 1');
  if (!Array.isArray(hand) || hand.length > total) throw new RangeError('compareOptions: hand должен быть списком не длиннее total');
  if (bid !== null && !isBid(bid)) throw new TypeError('compareOptions: bid должен быть {q, f} или null');
  const thr = Number.isFinite(threshold) ? threshold : 0.5;
  const rules = { wild: wild !== false };

  const options = [];
  let bidP = null;
  if (bid) {
    bidP = probBid(bid.q, bid.f, total, hand, rules.wild);
    options.push({ type: 'dudo', p: bidP, success: 1 - bidP, meetsThreshold: bidP < thr });
  }

  const min = minLegal(bid, total, rules);
  const safe = bestSafeRaise(bid, total, hand, rules, thr, probBid);
  if (min) {
    const p = probBid(min.q, min.f, total, hand, rules.wild);
    const sameAsSafe = !!safe && safe.q === min.q && safe.f === min.f;
    const opt = { type: 'minRaise', q: min.q, f: min.f, p, success: p, meetsThreshold: p >= thr };
    if (sameAsSafe) opt.isBestSafe = true;
    options.push(opt);
    if (safe && !sameAsSafe) {
      options.push({ type: 'safeRaise', q: safe.q, f: safe.f, p: safe.p, success: safe.p, meetsThreshold: true });
    }
  }
  return { bidP, options };
}

/**
 * Отмечает вариант, который выбрал игрок: { type: 'dudo' } или { type: 'raise', q, f }.
 * Если выбранной ставки среди вариантов нет, не отмечается ничего.
 */
export function markChosen(options, choice) {
  return options.map((o) => ({
    ...o,
    chosen: !!choice && (choice.type === 'dudo'
      ? o.type === 'dudo'
      : o.type !== 'dudo' && o.q === choice.q && o.f === choice.f),
  }));
}
