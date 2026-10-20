// src/stats_summary.js — числа для «Результатов»: партии, победы, точность тренажёра (без DOM).
//
// Процент по малой выборке вводит в заблуждение («0.0%» после одной партии), поэтому доля считается
// только когда данных достаточно; иначе возвращается null и интерфейс пишет «мало данных».

import { MIN_DECISIONS } from './weak_spots.js';

/** Минимум решений в тренажёре, чтобы показывать процент (как для слабых тем). */
export const MIN_DECISIONS_FOR_RATE = MIN_DECISIONS;
/** Минимум сыгранных партий, чтобы показывать процент побед. */
export const MIN_GAMES_FOR_RATE = 5;

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/**
 * Доля верных (или побед) с учётом малой выборки.
 * @returns {{n: number, good: number, enough: boolean, rate: number|null}}
 */
export function rateOf(good, n, min) {
  const total = count(n);
  const ok = Math.min(count(good), total);
  const enough = total > 0 && total >= min;
  return { n: total, good: ok, enough, rate: enough ? ok / total : null };
}

/**
 * @param {{stats?: object, games?: object[], queue?: unknown[]}} src профиль, история партий, очередь повторов
 * Партии берём из счётчиков профиля (они копятся всё время, история хранит только последние),
 * а если счётчики отстают от истории (старая копия, импорт) — из истории.
 */
export function summarize({ stats, games, queue } = {}) {
  const history = Array.isArray(games) ? games : [];
  const counted = count(stats?.totalGames);
  const fromCounters = counted >= history.length;
  const total = fromCounters ? counted : history.length;
  const wins = fromCounters ? Math.min(count(stats?.totalWins), total) : history.filter((g) => g && g.won).length;
  return {
    games: { total, wins, ...rateOf(wins, total, MIN_GAMES_FOR_RATE) },
    trainer: rateOf(stats?.good, stats?.n, MIN_DECISIONS_FOR_RATE),
    queue: Array.isArray(queue) ? queue.length : 0,
  };
}
