// read_sim.js — учебные раунды для «Читай вскрытие», когда сохранённых раундов мало.
//
// Чистый модуль. Раунд разыгрывают боты из bots.js за столом из 3–4 игроков; результат проходит через
// sanitizeRound, как настоящий. Зерно делает раунд воспроизводимым. Учебные раунды отличаются префиксом id
// и в статистику не попадают: «Над чем поработать» считает только вашу игру.

import { botDecide, BOT_STYLES } from './bots.js';
import { legal, minLegal } from './rules.js';
import { sanitizeRound, countFace } from './rounds.js';
import { canRead } from './read_drill.js';

export const SIM_PREFIX = 'sim-';
/** Сколько настоящих раундов достаточно, чтобы учебные не подмешивать. */
export const REAL_ENOUGH = 5;

const STYLES = ['careful', 'bluffer', 'smart', 'aggressor', 'skeptic'];
const MAX_STEPS = 60;

/** Учебный ли раунд (по id). */
export const isSimRound = (r) => typeof r?.id === 'string' && r.id.startsWith(SIM_PREFIX);

/** Простой генератор случайных чисел по зерну (mulberry32): одно зерно — одна последовательность. */
export function seededRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Один раунд по зерну: место 0 — «вы», остальные — боты разных стилей; раунд заканчивается проверкой.
 * @returns {object|null} раунд в формате rounds.js или null, если разыграть не удалось
 */
export function simulateRound(seed) {
  const rng = seededRng(seed);
  const n = 3 + Math.floor(rng() * 2);
  const wild = rng() >= 0.15;
  const dice = Array.from({ length: n }, () => 2 + Math.floor(rng() * 4));
  const hands = dice.map((k) => Array.from({ length: k }, () => 1 + Math.floor(rng() * 6)));
  const styles = dice.map((_, i) => (i === 0 ? null : STYLES[Math.floor(rng() * STYLES.length)]));
  const total = dice.reduce((a, b) => a + b, 0);
  const rules = { wild };

  let cur = Math.floor(rng() * n);
  let bid = null;
  const bids = [];
  let by = -1;
  for (let step = 0; step < MAX_STEPS; step++) {
    let d = null;
    try {
      d = botDecide({
        hand: hands[cur], publicState: { totalDice: total },
        bid: bid ? { q: bid.q, f: bid.f } : null, rules,
        style: BOT_STYLES[styles[cur] ?? 'smart'],
        opps: dice.map((k, i) => ({ k, i })).filter((o) => o.i !== cur).map(({ k }) => ({ k, faces: [] })),
        canCalza: false, rng,
      });
    } catch { d = null; }
    if (bid && d && (d.type === 'dudo' || d.type === 'calza')) { by = cur; break; }
    let next = null;
    if (d && d.type === 'raise' && Number.isInteger(d.q) && d.q <= total && legal(d.q, d.f, bid, rules)) next = { q: d.q, f: d.f };
    else next = minLegal(bid, total, rules);
    if (!next) {
      if (bid) { by = cur; break; }
      return null;
    }
    bid = { s: cur, q: next.q, f: next.f };
    bids.push(bid);
    cur = (cur + 1) % n;
  }
  if (by < 0 || !bids.length) return null;
  const last = bids[bids.length - 1];
  const actual = countFace(hands, last.f, wild);
  return sanitizeRound({
    id: `${SIM_PREFIX}${seed}`, ts: 0, round: 1, wild, me: 0,
    dice, styles, hands, bids,
    end: { kind: 'dudo', by, bidder: last.s, actual, ok: actual >= last.q },
  });
}

/**
 * Подходящий для упражнения учебный раунд: перебирает зёрна, начиная с seed.
 * @returns {object|null}
 */
export function makeSimRound(seed, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const r = simulateRound((Number(seed) >>> 0) + i);
    if (r && canRead(r)) return r;
  }
  return null;
}

/**
 * Откуда брать следующий раунд: 'real' (ваши сохранённые) или 'sim' (учебный).
 * Пока настоящих меньше REAL_ENOUGH, учебные подмешиваются; совсем без настоящих — только учебные.
 */
export function chooseSource(realCount, rnd = Math.random) {
  const n = Number.isInteger(realCount) && realCount > 0 ? realCount : 0;
  if (n === 0) return 'sim';
  if (n >= REAL_ENOUGH) return 'real';
  return rnd() < 0.5 ? 'sim' : 'real';
}
