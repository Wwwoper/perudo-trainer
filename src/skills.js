// skills.js — навыки игрока для «Результатов»: уровень, вывод и динамика по накопленным данным (без DOM).
//
// Навык — одна тема из byTag (метки решений партии, «чтение ставок», «лестница», темы викторины «Читай стол»)
// и серия викторины (quizLast / quizPrev профиля). Оценивается качество решений (шанс ставки выше порога),
// а не исход партии: хорошее решение может проиграть, и это не ухудшает оценку навыка.
//
// Уровни (по доле верных решений при достаточной выборке):
//   few      — меньше MIN_DECISIONS решений: вывода нет;
//   weak     — ниже SHAKY_FROM;  shaky — от SHAKY_FROM до GOOD_FROM;
//   good     — от GOOD_FROM;     mastered — от MASTERED_FROM и не меньше MASTERED_MIN_N решений.
// Случайные ходы в тренажёре дают 9–23 % верных (tools/trainer_emulator.py), поэтому 50 % — уже заметно лучше догадки.
// Для тем викторины доля сравнивается с лучшей постоянной догадкой (QUIZ_BASELINE): уровень считается по тому,
// какую часть пути от догадки до идеала вы прошли.
// Результат при 8–19 решениях помечается «предварительно».

import { WEAK_TAGS, WEAK_LABELS, TRAIN_MODE, MIN_DECISIONS } from './weak_spots.js';
import { QUIZ_BASELINE } from './quiz_stats.js';

export { MIN_DECISIONS };
export const SHAKY_FROM = 0.5;
export const GOOD_FROM = 0.65;
export const MASTERED_FROM = 0.8;
export const MASTERED_MIN_N = 50;
export const PRELIMINARY_BELOW = 20;
/** Для тем викторины: пройденная часть пути от догадки до идеала. */
export const QUIZ_GOOD_FROM = 0.4;
export const QUIZ_MASTERED_FROM = 0.7;
/** Окно тренда побед: партий в каждой из двух половин и порог заметного изменения. */
export const TREND_WINDOW = 20;
export const TREND_MIN_WINDOW = 10;
export const TREND_DELTA = 0.05;

export const LEVELS = Object.freeze(['mastered', 'good', 'shaky', 'weak', 'few']);
export const LEVEL_LABELS = Object.freeze({
  mastered: 'Освоено', good: 'Получается', shaky: 'Нестабильно', weak: 'Нужно поработать', few: 'Мало данных',
});
/** Группы показа: «освоено» входит в «получается». */
export const GROUPS = Object.freeze(['good', 'shaky', 'weak', 'few']);
export const SERIES_TAG = 'quizSeries';

const isCount = (v) => Number.isInteger(v) && v >= 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Уровень навыка по счётчику решений.
 * @param {number} good верных
 * @param {number} n всего решений
 * @param {{baseline?: number}} [o] baseline — лучшая постоянная догадка (темы викторины)
 * @returns {{level: string, share: number|null, prelim: boolean}}
 */
export function skillLevel(good, n, { baseline } = {}) {
  if (!isCount(n) || !isCount(good) || good > n || n < MIN_DECISIONS) {
    return { level: 'few', share: isCount(n) && isCount(good) && good <= n && n > 0 ? good / n : null, prelim: false };
  }
  const share = good / n;
  const prelim = n < PRELIMINARY_BELOW;
  const mastered = n >= MASTERED_MIN_N;
  if (baseline !== undefined) {
    if (share < baseline) return { level: 'weak', share, prelim };
    const way = (share - baseline) / (1 - baseline);   // 0 — на уровне догадки, 1 — без ошибок
    if (way >= QUIZ_MASTERED_FROM) return { level: mastered ? 'mastered' : 'good', share, prelim };
    return { level: way >= QUIZ_GOOD_FROM ? 'good' : 'shaky', share, prelim };
  }
  if (share >= MASTERED_FROM) return { level: mastered ? 'mastered' : 'good', share, prelim };
  if (share >= GOOD_FROM) return { level: 'good', share, prelim };
  return { level: share >= SHAKY_FROM ? 'shaky' : 'weak', share, prelim };
}

/** Короткий вывод по уровню (шаблон, без выдуманных подробностей). */
export function skillVerdict({ level, n, prelim, quiz = false }) {
  const text = {
    mastered: 'Освоено: тренировать эту тему больше не нужно.',
    good: 'Получается: результат устойчивый.',
    shaky: 'Результат нестабильный: есть над чем поработать.',
    weak: quiz ? 'Ответы хуже, чем если всегда выбирать одно и то же.' : 'Больше половины решений не проходят порог шанса.',
    few: `Для вывода нужно хотя бы ${MIN_DECISIONS} решений, сейчас ${n}.`,
  }[level];
  return prelim ? `${text} Результат предварительный: решений пока мало.` : text;
}

/**
 * Серия викторины «Читай стол»: последняя и предыдущая.
 * @returns {{last: object, prev: object|null, trend: 'up'|'down'|'same'|null}|null}
 */
export function quizTrend(stats) {
  const ok = (q) => isObj(q) && isCount(q.correct) && isCount(q.total) && q.total > 0 && q.correct <= q.total;
  if (!ok(stats?.quizLast)) return null;
  const last = stats.quizLast;
  const prev = ok(stats.quizPrev) ? stats.quizPrev : null;
  let trend = null;
  if (prev) {
    const a = last.correct / last.total;
    const b = prev.correct / prev.total;
    trend = a > b ? 'up' : a < b ? 'down' : 'same';
  }
  return { last, prev, trend };
}

/** Подпись динамики серии: «Лучше прошлой серии: было 9 из 20». */
export function quizTrendText(t) {
  if (!t?.prev) return '';
  const was = `было ${t.prev.correct} из ${t.prev.total}`;
  return { up: `Лучше прошлой серии: ${was}`, down: `Хуже прошлой серии: ${was}`, same: `Как в прошлой серии: ${was}` }[t.trend];
}

/**
 * Тренд побед: последние W партий против предыдущих W (W — не больше TREND_WINDOW, не меньше TREND_MIN_WINDOW).
 * История идёт от старых к новым. Иначе null: мало партий для вывода.
 * @returns {{last: number, prev: number, window: number, trend: 'up'|'down'|'same'}|null}
 */
export function winTrend(games) {
  const list = (Array.isArray(games) ? games : []).filter((g) => isObj(g) && typeof g.won === 'boolean');
  const window = Math.min(TREND_WINDOW, Math.floor(list.length / 2));
  if (window < TREND_MIN_WINDOW) return null;
  const rate = (part) => part.filter((g) => g.won).length / part.length;
  const last = rate(list.slice(-window));
  const prev = rate(list.slice(-2 * window, -window));
  const d = last - prev;
  return { last, prev, window, trend: d >= TREND_DELTA ? 'up' : d <= -TREND_DELTA ? 'down' : 'same' };
}

/**
 * Карточки навыков из профиля. Порядок внутри уровня: слабые и нестабильные — от худших, остальные — от лучших,
 * «мало данных» — от самых изученных.
 * @param {object} stats профиль (perudo.userProfile)
 * @returns {{tag: string, label: string, n: number, good: number, share: number|null, level: string,
 *            prelim: boolean, verdict: string, mode: string|null, trend: string}[]}
 */
export function skillCards(stats) {
  const byTag = isObj(stats?.byTag) ? stats.byTag : {};
  const cards = [];
  for (const tag of WEAK_TAGS) {
    const s = byTag[tag];
    if (!isObj(s) || !isCount(s.n) || !isCount(s.good) || s.good > s.n || s.n === 0) continue;
    const quiz = QUIZ_BASELINE[tag] !== undefined;
    const r = skillLevel(s.good, s.n, quiz ? { baseline: QUIZ_BASELINE[tag] } : {});
    cards.push({
      tag, label: cap(WEAK_LABELS[tag]), n: s.n, good: s.good, share: r.share, level: r.level, prelim: r.prelim,
      verdict: skillVerdict({ level: r.level, n: s.n, prelim: r.prelim, quiz }), mode: TRAIN_MODE[tag] || null, trend: '',
    });
  }
  const qt = quizTrend(stats);
  if (qt) {
    const { correct, total } = qt.last;
    const r = skillLevel(correct, total, { baseline: QUIZ_BASELINE.quizLast });
    cards.push({
      tag: SERIES_TAG, label: 'Читай стол (последняя серия)', n: total, good: correct, share: r.share, level: r.level, prelim: r.prelim,
      verdict: `Последняя серия: ${correct} верных из ${total}.`, mode: 'quiz', trend: quizTrendText(qt),
    });
  }
  const rank = (c) => LEVELS.indexOf(c.level);
  const order = (a, b) => rank(a) - rank(b)
    || (a.level === 'few' ? b.n - a.n : a.level === 'weak' || a.level === 'shaky' ? a.share - b.share : b.share - a.share)
    || a.tag.localeCompare(b.tag);
  return cards.sort(order);
}

/** Карточки по группам показа; пустые группы не возвращаются. */
export function groupCards(cards) {
  const groupOf = (c) => (c.level === 'mastered' ? 'good' : c.level);
  return GROUPS.map((g) => ({ group: g, label: LEVEL_LABELS[g], cards: cards.filter((c) => groupOf(c) === g) }))
    .filter((g) => g.cards.length);
}
