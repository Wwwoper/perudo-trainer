// table_quiz.js — викторина «Читай стол»: вопросы по одному раунду и проверка ответов.
//
// Чистый модуль. Вопрос — простой объект без разметки; интерфейс рисует его сам. Каждый вид вопроса — отдельная
// функция build…(round), которая возвращает вопрос или null, если раунд для него не годится.
// Общая форма вопроса:
//   { kind, input: 'two'|'player'|'bid'|'number', title, options?, answer, explain }
// Ответ проверяет gradeQuestion: { ok, points, max }.

import { seatLabel } from './read_drill.js';

export const KIND_LAST_TRUE = 'lastTrue';
const GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Грань как символ кубика (⚃). */
export const faceGlyph = (f) => GLYPH[f] ?? String(f);

/**
 * «Последняя ставка верна?» — две кнопки. Берутся раунды, где ставку проверили («Не верю»),
 * а её автор — не вы. Ответ: 'yes', если нужных кубиков на столе хватило.
 * @returns {object|null}
 */
export function buildLastTrue(round) {
  const bids = Array.isArray(round?.bids) ? round.bids : [];
  const last = bids[bids.length - 1];
  if (!last || round.end?.kind !== 'dudo' || last.s === round.me) return null;
  const actual = round.end.actual;
  if (!Number.isInteger(actual) || !Number.isInteger(last.q) || !Number.isInteger(last.f)) return null;
  const name = seatLabel(round, last.s);
  const ok = actual >= last.q;
  const cond = (round.wild && last.f !== 1) ? ' с учётом единиц-джокеров' : '';
  return {
    kind: KIND_LAST_TRUE,
    input: 'two',
    title: `Ставка ${name}: ${last.q} × ${faceGlyph(last.f)}. Её проверили. Она верна?`,
    bid: { s: last.s, q: last.q, f: last.f, name },
    options: [{ v: 'yes', label: 'Верна' }, { v: 'no', label: 'Не верна' }],
    answer: ok ? 'yes' : 'no',
    explain: `На столе было ${actual} × ${faceGlyph(last.f)}${cond}, а в ставке ${last.q}: ${ok ? 'хватило' : 'не хватило'}.`,
  };
}

/**
 * Проверка ответа на вопрос с точным совпадением (кнопки, выбор игрока или ставки).
 * @returns {{ok:boolean, points:number, max:number}}
 */
export function gradeQuestion(question, value) {
  const ok = !!question && value === question.answer;
  return { ok, points: ok ? 1 : 0, max: 1 };
}
