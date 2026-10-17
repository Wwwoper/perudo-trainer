// weak_spots.js — «Над чем поработать»: выбор слабых тем по счётчикам решений (byTag).
//
// Чистый модуль: получает объект профиля вида { метка: { n, good } } и возвращает данные для показа.
// «Слабое место» — по шансу ставки в текущей модели, а не оценка выигрыша; решает число решений:
// тема с малой выборкой отдельно помечается «пока мало данных» и в слабые не попадает.

import { MOMENT_TAGS, TAG_LABELS } from './moments.js';

/** Минимум решений по теме, чтобы делать вывод. */
export const MIN_DECISIONS = 8;
/** Сколько слабых тем показывать. */
export const MAX_WEAK = 3;

/** Режим тренажёра, в котором можно потренировать тему. У остальных тем кнопки нет. */
export const TRAIN_MODE = {
  endgame: 'endgame',
  lastDie: 'solo',
  palifico: 'nowild',
  bigTable: 'big',
};

const isCount = (v) => Number.isInteger(v) && v >= 0;

/**
 * @param {object} byTag счётчики по меткам; мусор и неизвестные метки пропускаются
 * @returns {{weak: object[], pending: object[]}}
 *   weak — до limit тем с самой низкой долей верных (только те, где есть ошибки):
 *     {tag, label, n, good, share, mode|null}, от слабых к менее слабым;
 *   pending — темы с числом решений меньше minN: {tag, label, n}
 */
export function weakSpots(byTag, { minN = MIN_DECISIONS, limit = MAX_WEAK } = {}) {
  const weak = [];
  const pending = [];
  const src = byTag && typeof byTag === 'object' && !Array.isArray(byTag) ? byTag : {};
  for (const tag of MOMENT_TAGS) {
    const s = src[tag];
    if (!s || !isCount(s.n) || !isCount(s.good) || s.good > s.n || s.n === 0) continue;
    const label = TAG_LABELS[tag];
    if (s.n < minN) { pending.push({ tag, label, n: s.n }); continue; }
    if (s.good === s.n) continue;
    weak.push({ tag, label, n: s.n, good: s.good, share: s.good / s.n, mode: TRAIN_MODE[tag] || null });
  }
  weak.sort((a, b) => a.share - b.share || b.n - a.n);
  return { weak: weak.slice(0, Math.max(0, limit)), pending };
}
