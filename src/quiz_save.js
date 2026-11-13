// quiz_save.js — снимок незавершённой серии «Читай стол»: сохранить и безопасно восстановить.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage, ни об интерфейсе. Хранилище читает
// и пишет storage.js, подключение к экрану — отдельно (quiz_view.js).
//
// Снимок: { v, savedAt, tables, answers, revealed }
//   tables   — столы серии: { round, questions } как в createSeries;
//   answers  — ваши ответы по порядку (строка — вариант, число — ответ на «Сколько на столе»);
//   revealed — у скольких столов уже показано вскрытие (оно нужно, чтобы после возврата не потерять разбор).
// Баллы и верность в снимок не пишутся: при восстановлении ответы проигрываются заново через submitAnswer.
//
// Всё, что приходит из хранилища, не доверяется. Раунд проходит строгую проверку sanitizeRound, вопросы
// собираются заново по белому списку полей, а правильный ответ каждого вопроса пересчитывается по раунду.
// Любая странность, старая версия формата или срок больше 7 суток — снимок отбрасывается целиком:
// лучше начать серию заново, чем получить неверную оценку.

import { sanitizeRound, countFace } from './rounds.js';
import { canRead } from './read_drill.js';
import {
  PER_TABLE, KIND_LAST_TRUE, KIND_WEAKEST_BID, KIND_WHO_HOLDS_MORE, KIND_COUNT_FACE, WEAK_CHOICES,
} from './table_quiz.js';
import { submitAnswer, progress, totalQuestions } from './quiz_series.js';

export const QUIZ_SAVE_VERSION = 1;
/** Незаконченная серия старше этого срока не предлагается (7 суток). */
export const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const MAX_TABLES = 8;

const MAX_TEXT = 400;
const MAX_LINES = 12;
const INPUT = {
  [KIND_LAST_TRUE]: 'two', [KIND_WEAKEST_BID]: 'bid', [KIND_WHO_HOLDS_MORE]: 'player', [KIND_COUNT_FACE]: 'number',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isFace = (v) => isInt(v) && v >= 1 && v <= 6;
const str = (v, max = MAX_TEXT) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function strList(v, { min = 1 } = {}) {
  if (!Array.isArray(v) || v.length < min || v.length > MAX_LINES) return null;
  const out = v.map((s) => str(s));
  return out.every((s) => s !== null) ? out : null;
}

/** Число кубиков грани f у одного игрока (с учётом джокеров). */
const holds = (round, seat, f) => countFace([round.hands[seat]], f, round.wild);

/**
 * Собирает вопрос заново по белому списку полей и сверяет правильный ответ с раундом.
 * @returns {object|null} чистая копия вопроса или null
 */
export function sanitizeQuestion(round, raw) {
  if (!isObj(raw) || !Object.hasOwn(INPUT, raw.kind) || raw.input !== INPUT[raw.kind]) return null;
  const title = str(raw.title), short = str(raw.short), explain = str(raw.explain, 2000);
  const lines = strList(raw.lines);
  if (!title || !short || !explain || !lines) return null;
  const out = { kind: raw.kind, input: raw.input, title, short, explain, lines };
  if (raw.hint !== undefined) { out.hint = str(raw.hint); if (!out.hint) return null; }
  if (raw.linesOk !== undefined) { out.linesOk = strList(raw.linesOk); if (!out.linesOk) return null; }
  const bids = round.bids;
  const last = bids[bids.length - 1];

  if (raw.kind === KIND_COUNT_FACE) {
    if (!isFace(raw.face) || !isObj(raw.range) || !isInt(raw.range.min) || !isInt(raw.range.max)) return null;
    if (raw.range.min !== 0 || raw.range.max < 1 || raw.range.max > 60) return null;
    const actual = countFace(round.hands, raw.face, round.wild);
    if (raw.answer !== actual || actual > raw.range.max) return null;
    return { ...out, face: raw.face, range: { min: 0, max: raw.range.max }, answer: actual };
  }

  if (!Array.isArray(raw.options)) return null;
  const options = [];

  if (raw.kind === KIND_LAST_TRUE) {
    if (round.end?.kind !== 'dudo' || last.s === round.me) return null;
    const b = raw.bid;
    if (!isObj(b) || b.s !== last.s || b.q !== last.q || b.f !== last.f || !str(b.name, 40)) return null;
    if (raw.options.length !== 2 || raw.options[0]?.v !== 'yes' || raw.options[1]?.v !== 'no') return null;
    for (const o of raw.options) { const label = str(o.label, 40); if (!label) return null; options.push({ v: o.v, label }); }
    const answer = round.end.actual >= last.q ? 'yes' : 'no';
    if (raw.answer !== answer) return null;
    return { ...out, bid: { s: last.s, q: last.q, f: last.f, name: b.name }, options, answer };
  }

  if (raw.kind === KIND_WEAKEST_BID) {
    if (raw.options.length !== WEAK_CHOICES) return null;
    const seen = new Set();
    for (const o of raw.options) {
      if (!isObj(o) || !isInt(o.n) || o.n < 1 || o.n > bids.length || seen.has(o.n)) return null;
      const b = bids[o.n - 1];
      if (b.s === round.me || o.s !== b.s || o.q !== b.q || o.f !== b.f || o.v !== String(o.n)) return null;
      const name = str(o.name, 40), label = str(o.label, 80);
      if (!name || !label) return null;
      seen.add(o.n);
      options.push({ v: o.v, n: o.n, s: o.s, q: o.q, f: o.f, name, label });
    }
    const counts = options.map((o) => holds(round, o.s, o.f));
    const min = Math.min(...counts);
    if (counts.filter((c) => c === min).length !== 1) return null;
    const answer = options[counts.indexOf(min)].v;
    if (raw.answer !== answer) return null;
    return { ...out, options, answer };
  }

  // KIND_WHO_HOLDS_MORE
  if (raw.options.length !== 2) return null;
  const seats = new Set();
  for (const o of raw.options) {
    if (!isObj(o) || !isInt(o.s) || o.s < 0 || o.s >= round.hands.length || o.s === round.me || seats.has(o.s)) return null;
    const theirs = bids.filter((b) => b.s === o.s);
    if (!theirs.length || theirs[theirs.length - 1].f !== o.f || o.v !== String(o.s)) return null;
    const name = str(o.name, 40), label = str(o.label, 80);
    if (!name || !label) return null;
    seats.add(o.s);
    options.push({ v: o.v, s: o.s, f: o.f, name, label });
  }
  const [a, b] = options.map((o) => holds(round, o.s, o.f));
  if (a === b) return null;
  const answer = a > b ? options[0].v : options[1].v;
  if (raw.answer !== answer) return null;
  return { ...out, options, answer };
}

/** Ответ годится для вопроса: вариант из списка или целое число в границах. Возвращает нормализованное значение. */
function cleanAnswer(question, value) {
  if (question.input === 'number') {
    return isInt(value) && value >= question.range.min && value <= question.range.max ? value : null;
  }
  const v = typeof value === 'string' ? value : (isInt(value) ? String(value) : null);
  return v !== null && question.options.some((o) => o.v === v) ? v : null;
}

/**
 * Снимок серии для записи в хранилище.
 * @param {{tables:object[], results:object[]}} series
 * @param {number} revealed у скольких столов показано вскрытие
 * @returns {object|null} null, если сохранять нечего: серия пустая, ещё без ответов или уже закончена
 */
export function makeQuizSnapshot(series, revealed, now = Date.now()) {
  if (!series || !Array.isArray(series.tables) || !Array.isArray(series.results)) return null;
  const answered = series.results.length;
  if (!series.tables.length || answered < 1 || answered >= totalQuestions(series)) return null;
  return {
    v: QUIZ_SAVE_VERSION,
    savedAt: now,
    tables: series.tables.map((t) => ({ round: t.round, questions: t.questions })),
    answers: series.results.map((r) => r.value),
    revealed: Math.max(0, Math.min(Number(revealed) || 0, series.tables.length)),
  };
}

/**
 * Восстанавливает серию из того, что лежало в хранилище.
 * @returns {{series:{tables:object[], results:object[]}, revealed:number}|null} null — снимок негоден и отброшен
 */
export function restoreQuizSnapshot(raw, now = Date.now()) {
  try {
    if (!isObj(raw) || raw.v !== QUIZ_SAVE_VERSION) return null;
    if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;
    if (raw.savedAt > now + 24 * 3600 * 1000 || now - raw.savedAt > MAX_AGE_MS) return null;
    if (!Array.isArray(raw.tables) || raw.tables.length < 1 || raw.tables.length > MAX_TABLES) return null;
    if (!Array.isArray(raw.answers) || raw.answers.length < 1) return null;

    const tables = [];
    for (const t of raw.tables) {
      if (!isObj(t)) return null;
      const round = sanitizeRound(t.round);
      if (!round || !canRead(round) || !Array.isArray(t.questions) || t.questions.length !== PER_TABLE) return null;
      const questions = t.questions.map((q) => sanitizeQuestion(round, q));
      if (questions.some((q) => q === null)) return null;
      tables.push({ round, questions });
    }
    let series = { tables, results: [] };
    const total = totalQuestions(series);
    if (raw.answers.length >= total) return null;   // законченную серию не предлагаем: она уже учтена

    for (const value of raw.answers) {
      const cur = progress(series);
      const q = series.tables[cur.table].questions[cur.q];
      const clean = cleanAnswer(q, value);
      if (clean === null) return null;
      series = submitAnswer(series, clean).series;
    }
    const done = Math.floor(raw.answers.length / PER_TABLE);
    if (!isInt(raw.revealed) || raw.revealed > done || raw.revealed < done - 1 || raw.revealed < 0) return null;
    return { series, revealed: raw.revealed };
  } catch (e) {
    return null;
  }
}

/**
 * Что показать на карточке «Незаконченная серия»: сколько ответов дано, из скольких, на каком столе
 * и ждёт ли вскрытие стола, которое вы ещё не видели.
 * @returns {{answered:number, total:number, table:number, tables:number, pendingReveal:boolean}}
 */
export function describeSavedSeries(series, revealed) {
  const answered = series.results.length;
  const done = Math.floor(answered / PER_TABLE);
  const pendingReveal = revealed < done;
  return {
    answered,
    total: totalQuestions(series),
    table: (pendingReveal ? revealed : progress(series).table) + 1,
    tables: series.tables.length,
    pendingReveal,
  };
}
