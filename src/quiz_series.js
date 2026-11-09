// quiz_series.js — серия викторины «Читай стол»: столы, ход серии, баллы и итог.
//
// Чистый модуль, без интерфейса и хранилища. Серия — это набор столов (раунд + его вопросы) и список ответов.
// Серия не меняется на месте: submitAnswer возвращает новую. Итог сравнивается с лучшей постоянной догадкой
// по каждому виду вопросов (кнопка «всегда Верна», «всегда первый вариант», «всегда число N»), а не с шансом вслепую.

import {
  BUILDERS, PER_TABLE, KIND_LAST_TRUE, KIND_WEAKEST_BID, KIND_WHO_HOLDS_MORE, KIND_COUNT_FACE,
  pickTableQuestions, gradeQuestion,
} from './table_quiz.js';
import { canRead } from './read_drill.js';
import { simulateRound, isSimRound } from './read_sim.js';

export const TABLES_DEFAULT = 5;
export const KIND_NAMES = Object.freeze({
  [KIND_LAST_TRUE]: 'Верность ставки',
  [KIND_WEAKEST_BID]: 'Самая слабая ставка',
  [KIND_WHO_HOLDS_MORE]: 'Кто держит больше',
  [KIND_COUNT_FACE]: 'Сколько на столе',
});

const lcg = (seed) => { let s = (Number(seed) >>> 0) % 2147483647 || 1; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; };

/**
 * Для каждого вида вопросов — доля возможных баллов, которую берёт лучшая постоянная догадка.
 * Считается один раз по учебным столам с фиксированным зерном, поэтому всегда одинакова.
 * @returns {Record<string, number>}
 */
let baselineCache = null;
export function kindBaselines() {
  if (baselineCache) return baselineCache;
  const rnd = lcg(20261109);
  const by = Object.fromEntries(Object.keys(BUILDERS).map((k) => [k, []]));
  for (let seed = 1; seed <= 3000; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    for (const [kind, build] of Object.entries(BUILDERS)) {
      const q = build(r, rnd);
      if (q) by[kind].push(q);
    }
  }
  const out = {};
  for (const [kind, qs] of Object.entries(by)) {
    if (!qs.length) { out[kind] = 0.5; continue; }
    const choices = new Map();   // постоянная догадка → сумма баллов
    const maxSum = qs.reduce((a, q) => a + gradeQuestion(q, null).max, 0);
    for (const q of qs) {
      const guesses = q.input === 'number'
        ? Array.from({ length: 15 }, (_, c) => c)
        : q.options.map((o, i) => (q.input === 'two' ? o.v : `#${i}`));
      for (const g of guesses) {
        const value = (typeof g === 'string' && g.startsWith('#')) ? q.options[Number(g.slice(1))].v : g;
        choices.set(g, (choices.get(g) ?? 0) + gradeQuestion(q, value).points);
      }
    }
    out[kind] = Math.max(...choices.values()) / maxSum;
  }
  baselineCache = out;
  return out;
}

/**
 * Собирает серию. Сначала берутся ваши сохранённые раунды, где набирается целый стол вопросов,
 * недостающие столы добираются учебными раундами.
 * @param {{tables?:number, rounds?:object[], rnd?:()=>number}} opts
 * @returns {{tables:{round:object, questions:object[]}[], results:object[]}}
 */
export function createSeries({ tables = TABLES_DEFAULT, rounds = [], rnd = Math.random } = {}) {
  const out = [];
  const real = rounds.filter((r) => canRead(r) && !isSimRound(r));
  for (let i = real.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [real[i], real[j]] = [real[j], real[i]];
  }
  const take = (round) => {
    const questions = pickTableQuestions(round, { rnd });
    if (questions.length === PER_TABLE) out.push({ round, questions });
  };
  for (const r of real) { if (out.length >= tables) break; take(r); }
  const base = Math.floor(rnd() * 1e6) + 1;
  for (let i = 0; out.length < tables && i < 600; i++) {
    const r = simulateRound(base + i);
    if (r && canRead(r)) take(r);
  }
  return { tables: out, results: [] };
}

/** Всего вопросов в серии. */
export const totalQuestions = (series) => series.tables.reduce((a, t) => a + t.questions.length, 0);

/**
 * Где серия сейчас: номер стола и вопроса (с нуля) и закончена ли она.
 * @returns {{table:number, q:number, done:boolean}}
 */
export function progress(series) {
  let left = series.results.length;
  for (let t = 0; t < series.tables.length; t++) {
    const n = series.tables[t].questions.length;
    if (left < n) return { table: t, q: left, done: false };
    left -= n;
  }
  return { table: series.tables.length, q: 0, done: true };
}

/** Текущий вопрос или null, если серия закончена. */
export function currentQuestion(series) {
  const p = progress(series);
  if (p.done) return null;
  const { round, questions } = series.tables[p.table];
  return { table: p.table, index: p.q, question: questions[p.q], round };
}

/**
 * Записывает ответ на текущий вопрос. Возвращает новую серию и результат; на закончившейся серии ничего не меняет.
 * @returns {{series:object, result:object|null, tableDone:boolean}}
 */
export function submitAnswer(series, value) {
  const cur = currentQuestion(series);
  if (!cur) return { series, result: null, tableDone: false };
  const g = gradeQuestion(cur.question, value);
  const result = { table: cur.table, index: cur.index, kind: cur.question.kind, value, ...g };
  const next = { ...series, results: [...series.results, result] };
  const tableDone = cur.index === series.tables[cur.table].questions.length - 1;
  return { series: next, result, tableDone };
}

/**
 * Итог серии: баллы, число верных ответов, сравнение с лучшей постоянной догадкой и разбор по видам.
 * Лучшая догадка считается по тем же вопросам, которые вам достались: сумма долей возможных баллов.
 */
export function summarize(series) {
  const base = kindBaselines();
  const kinds = {};
  let points = 0, max = 0, correct = 0, guess = 0;
  for (const r of series.results) {
    const k = (kinds[r.kind] ||= { kind: r.kind, name: KIND_NAMES[r.kind] ?? r.kind, n: 0, correct: 0, points: 0, max: 0, guess: 0 });
    k.n++; k.points += r.points; k.max += r.max; k.guess += (base[r.kind] ?? 0.5) * r.max;
    if (r.ok) { k.correct++; correct++; }
    points += r.points; max += r.max; guess += (base[r.kind] ?? 0.5) * r.max;
  }
  const list = Object.values(kinds).map((k) => ({ ...k, rate: k.max ? k.points / k.max : 0, guessRate: k.max ? k.guess / k.max : 0 }));
  return {
    answered: series.results.length, total: totalQuestions(series),
    correct, points, max, guess, gain: points - guess,
    kinds: list,
    weakest: list.filter((k) => k.n >= 2 && k.rate < k.guessRate).sort((a, b) => (a.rate - a.guessRate) - (b.rate - b.guessRate))[0] ?? null,
  };
}
