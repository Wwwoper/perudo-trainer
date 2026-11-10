// quiz_stats.js — викторина «Читай стол» в статистике: счётчики по видам вопросов и последняя серия.
//
// Чистый модуль. Счётчики лежат в byTag профиля как { n, good } под метками ниже, поэтому проходят
// через data_schema и резервную копию как все остальные. «Верный» ответ — точный; у вопроса про число
// ещё и «почти» (ошибка в один кубик): иначе точный ответ слишком редок, чтобы сравнивать его с догадкой.

import {
  KIND_LAST_TRUE, KIND_WEAKEST_BID, KIND_WHO_HOLDS_MORE, KIND_COUNT_FACE,
} from './table_quiz.js';

/** Метка темы в byTag для каждого вида вопросов. */
export const QUIZ_TAGS = Object.freeze({
  [KIND_LAST_TRUE]: 'quizLast',
  [KIND_WEAKEST_BID]: 'quizWeak',
  [KIND_WHO_HOLDS_MORE]: 'quizHold',
  [KIND_COUNT_FACE]: 'quizCount',
});

/** Названия тем в «Над чем поработать» (с маленькой буквы: блок сам ставит заглавную). */
export const QUIZ_LABELS = Object.freeze({
  quizLast: 'верность ставки (викторина)',
  quizWeak: 'самая слабая ставка (викторина)',
  quizHold: 'кто держит больше (викторина)',
  quizCount: 'сколько кубиков на столе (викторина)',
});

/**
 * Доля верных ответов у лучшей постоянной догадки по каждой теме. Считается по учебным столам; тест
 * пересчитывает её и следит, чтобы константы не разошлись с реальностью.
 */
export const QUIZ_BASELINE = Object.freeze({
  quizLast: 0.55,
  quizWeak: 0.40,
  quizHold: 0.52,
  quizCount: 0.55,
});

/** Верный ли ответ для счётчика: точный, а для числа — ещё и с ошибкой в один кубик. */
export const isGoodAnswer = (r) => !!r && (r.ok === true || (r.kind === KIND_COUNT_FACE && r.points > 0));

/**
 * Добавляет ответы серии в счётчики тем; исходный объект не меняется.
 * @param {object} byTag счётчики по меткам
 * @param {{kind:string, ok:boolean, points:number}[]} results ответы серии
 * @returns {object}
 */
export function addQuizResults(byTag, results) {
  const src = byTag && typeof byTag === 'object' && !Array.isArray(byTag) ? byTag : {};
  const out = { ...src };
  for (const r of Array.isArray(results) ? results : []) {
    const tag = QUIZ_TAGS[r?.kind];
    if (!tag) continue;
    const cur = out[tag] && Number.isInteger(out[tag].n) && Number.isInteger(out[tag].good) ? out[tag] : { n: 0, good: 0 };
    out[tag] = { n: cur.n + 1, good: cur.good + (isGoodAnswer(r) ? 1 : 0) };
  }
  return out;
}

/**
 * Запись о последней серии для старта: числа без подробностей.
 * @param {ReturnType<import('./quiz_series.js').summarize>} sum
 */
export function lastSeriesRecord(sum) {
  return {
    correct: sum.correct, total: sum.total, points: sum.points, max: sum.max,
    guess: Math.round(sum.guess),
  };
}

/** Строка про последнюю серию на старте или null, если серий ещё не было. */
export function lastSeriesText(rec) {
  if (!rec || !Number.isInteger(rec.total) || rec.total <= 0) return null;
  const d = rec.points - rec.guess;
  const cmp = d > 0 ? `, на ${Math.abs(d)} лучше постоянной догадки`
    : d < 0 ? `, на ${Math.abs(d)} хуже постоянной догадки` : ', на уровне постоянной догадки';
  return `Последняя серия: верно ${rec.correct} из ${rec.total}, баллов ${rec.points} из ${rec.max}${cmp}.`;
}
