// ladder.js — «Лестница ставок»: ситуации с историей торгов (3–5 ставок), где несколько соперников могли назвать одну цифру.
//
// Чистый модуль: без DOM и хранилища, вероятности подаются снаружи (probBid, probBidRead из core.js).
// Ситуация: { wild, n, h, ks, bids, q, f }
//   n — всего кубиков, h — ваша рука, ks — число кубиков у каждого соперника,
//   bids — ставки по порядку { s: номер соперника (0…), q, f }, q и f — последняя ставка.

import { legal } from './rules.js';
import { TABLE_TRUST } from './table_read.js';

export const LADDER_MIN_BIDS = 3;
export const LADDER_MAX_BIDS = 5;
export const MAX_OPPONENTS = 4;

const isInt = Number.isInteger;

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Соперники для probBidRead: число кубиков и цифры, которые каждый назвал. */
export function ladderOpponents(sit) {
  return sit.ks.map((k, i) => ({
    k, faces: [...new Set(sit.bids.filter((b) => b.s === i).map((b) => b.f))],
  }));
}

/**
 * Случайная ситуация. Чаще всего две подряд идущие ставки разных соперников называют одну цифру
 * («подтверждение»), иначе цифры разные.
 * @param {{rnd?: () => number, wild?: boolean}} o
 * @returns {object|null}
 */
export function buildLadder({ rnd = Math.random, wild = true } = {}) {
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const rules = { wild };
  const m = ri(2, MAX_OPPONENTS);
  const ks = Array.from({ length: m }, () => ri(2, 5));
  const k = ri(2, 5);
  const h = Array.from({ length: k }, () => ri(1, 6));
  const n = k + ks.reduce((a, b) => a + b, 0);
  const len = ri(LADDER_MIN_BIDS, LADDER_MAX_BIDS);
  const focus = ri(wild ? 2 : 1, 6);
  const pair = rnd() < 0.7 ? ri(0, len - 2) : -1;     // позиция первой из двух ставок на одну цифру
  const s0 = ri(0, m - 1);

  const bids = [];
  for (let j = 0; j < len; j++) {
    const prev = bids.length ? bids[bids.length - 1] : null;
    let face = (j === pair || j === pair + 1) ? focus : ri(wild ? 2 : 1, 6);
    if (!wild && prev) face = prev.f;                    // в Палифико цифру менять нельзя
    let q = 0;
    for (let x = 1; x <= n; x++) if (legal(x, face, prev, rules)) { q = x; break; }
    if (!q) {
      // на эту цифру ставить уже нельзя: берём любую допустимую
      for (let f2 = wild ? 2 : 1; f2 <= 6 && !q; f2++) {
        for (let x = 1; x <= n; x++) if (legal(x, f2, prev, rules)) { q = x; face = f2; break; }
      }
    }
    if (!q) break;
    const jump = prev && rnd() < 0.35 ? ri(1, 2) : (prev ? 0 : ri(0, Math.max(0, Math.round(n * 0.15))));
    for (let x = Math.min(n, q + jump); x >= q; x--) if (legal(x, face, prev, rules)) { q = x; break; }
    bids.push({ s: (s0 + j) % m, q, f: face });
  }
  if (bids.length < LADDER_MIN_BIDS) return null;
  const last = bids[bids.length - 1];
  return { wild, n, h, ks, bids, q: last.q, f: last.f };
}

/**
 * Шансы последней ставки: по вашим кубикам и с учётом ставок стола.
 * @param {object} sit ситуация
 * @param {{probBid: Function, probBidRead: Function}} P вероятности из core.js
 * @returns {{pOwn: number, pRead: number, named: number, opps: number}}
 */
export function ladderChances(sit, P) {
  const opps = ladderOpponents(sit);
  return {
    pOwn: P.probBid(sit.q, sit.f, sit.n, sit.h, sit.wild),
    pRead: P.probBidRead(sit.q, sit.f, sit.h, opps, sit.wild, TABLE_TRUST),
    named: opps.filter((o) => o.faces.includes(sit.f)).length,
    opps: opps.length,
  };
}

const pc = (x) => `${Math.round(x * 100)} %`;

/** Строки разбора: шанс «по вашим кубикам» и «с учётом стола», кто назвал цифру. Только факты и расчёт. */
export function ladderLines(sit, ch) {
  const lines = [`По вашим кубикам ставка ${sit.q}×${sit.f} верна с шансом ${pc(ch.pOwn)}.`];
  if (ch.named >= 2) {
    lines.push(`Цифру ${sit.f} назвали ${ch.named} из ${ch.opps} ${plural(ch.opps, 'соперника', 'соперников', 'соперников')}. Их ставки считаются подтверждением, и с учётом стола шанс ${pc(ch.pRead)}.`);
  } else {
    lines.push(`Цифру ${sit.f} назвал один соперник: подтверждения от других нет, и с учётом стола шанс ${pc(ch.pRead)}.`);
  }
  lines.push('Оценка с учётом стола приблизительная: она лишь слегка повышает шанс цифры у тех, кто её назвал.');
  return lines;
}

/** Хорошее ли решение «Не верю»: ставка с учётом стола верна реже порога. */
export function gradeDudo(ch, threshold) {
  return ch.pRead < threshold;
}

/** Хорошее ли решение «Ставлю Q×F»: новая ставка с учётом стола верна не реже порога. */
export function gradeRaise(sit, Q, F, threshold, P) {
  return P.probBidRead(Q, F, sit.h, ladderOpponents(sit), sit.wild, TABLE_TRUST) >= threshold;
}

/** Проверка формы ситуации (из хранилища или очереди): возвращает чистую копию или null. */
export function sanitizeLadder(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { ks, h, bids } = raw;
  if (typeof raw.wild !== 'boolean') return null;
  if (!Array.isArray(ks) || ks.length < 2 || ks.length > MAX_OPPONENTS || !ks.every((v) => isInt(v) && v >= 1 && v <= 10)) return null;
  if (!Array.isArray(h) || h.length < 1 || h.length > 10 || !h.every((v) => isInt(v) && v >= 1 && v <= 6)) return null;
  const n = h.length + ks.reduce((a, b) => a + b, 0);
  if (raw.n !== n) return null;
  if (!Array.isArray(bids) || bids.length < LADDER_MIN_BIDS || bids.length > 12) return null;
  const clean = [];
  for (const b of bids) {
    if (!b || !isInt(b.s) || b.s < 0 || b.s >= ks.length || !isInt(b.q) || b.q < 1 || b.q > n || !isInt(b.f) || b.f < 1 || b.f > 6) return null;
    clean.push({ s: b.s, q: b.q, f: b.f });
  }
  const last = clean[clean.length - 1];
  if (raw.q !== last.q || raw.f !== last.f) return null;
  return { wild: raw.wild, n, h: h.slice(), ks: ks.slice(), bids: clean, q: last.q, f: last.f };
}

/**
 * Записать один ответ в режиме «Лестница ставок» в счётчики тем (byTag.ladder).
 * Исходный объект не меняется; мусор вместо счётчиков считается нулями.
 * @param {object} byTag счётчики по меткам
 * @param {boolean} good ответ верен
 */
export function addLadderResult(byTag, good) {
  const src = byTag && typeof byTag === 'object' && !Array.isArray(byTag) ? byTag : {};
  const old = src.ladder && Number.isInteger(src.ladder.n) && Number.isInteger(src.ladder.good) && src.ladder.n >= 0 &&
    src.ladder.good >= 0 && src.ladder.good <= src.ladder.n ? src.ladder : { n: 0, good: 0 };
  return { ...src, ladder: { n: old.n + 1, good: old.good + (good ? 1 : 0) } };
}
