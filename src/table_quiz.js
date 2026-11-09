// table_quiz.js — викторина «Читай стол»: вопросы по одному раунду и проверка ответов.
//
// Чистый модуль. Вопрос — простой объект без разметки; интерфейс рисует его сам. Каждый вид вопроса — отдельная
// функция build…(round), которая возвращает вопрос или null, если раунд для него не годится.
// Общая форма вопроса:
//   { kind, input: 'two'|'player'|'bid'|'number', title, options?, answer, explain }
// Ответ проверяет gradeQuestion: { ok, points, max }.

import { seatLabel } from './read_drill.js';
import { countFace } from './rounds.js';

export const KIND_LAST_TRUE = 'lastTrue';
export const KIND_WEAKEST_BID = 'weakestBid';
/** Сколько ставок показывается в вопросе «Какая ставка самая слабая?». */
export const WEAK_CHOICES = 3;
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
 * «Какая ставка самая слабая?» — выбор одной из трёх чужих ставок. Слабая — та, у автора которой в руке меньше
 * всего кубиков названной грани (с учётом джокеров). Берутся только тройки, где такая ставка одна.
 * Ставки в вариантах идут в порядке хода. rnd нужен, чтобы выбрать тройку из нескольких возможных.
 * @returns {object|null}
 */
export function buildWeakestBid(round, rnd = Math.random) {
  const bids = Array.isArray(round?.bids) ? round.bids : [];
  const hands = Array.isArray(round?.hands) ? round.hands : [];
  const items = [];
  bids.forEach((b, i) => {
    if (!b || b.s === round.me || !Array.isArray(hands[b.s])) return;
    items.push({ n: i + 1, s: b.s, q: b.q, f: b.f, has: countFace([hands[b.s]], b.f, round.wild) });
  });
  if (items.length < WEAK_CHOICES) return null;
  for (let t = 0; t < 30; t++) {
    const pool = items.slice();
    const pick = [];
    while (pick.length < WEAK_CHOICES) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    pick.sort((a, b) => a.n - b.n);
    const min = Math.min(...pick.map((x) => x.has));
    const weakest = pick.filter((x) => x.has === min);
    if (weakest.length !== 1) continue;
    const w = weakest[0];
    const options = pick.map((x) => {
      const name = seatLabel(round, x.s);
      return { v: String(x.n), n: x.n, s: x.s, q: x.q, f: x.f, name, label: `${name}: ${x.q} × ${faceGlyph(x.f)}` };
    });
    const cond = (round.wild) ? ' (единицы — джокеры)' : '';
    const detail = pick.map((x) => `${seatLabel(round, x.s)} — ${x.has} из ${hands[x.s].length}`).join(', ');
    return {
      kind: KIND_WEAKEST_BID,
      input: 'bid',
      title: 'Какая из этих ставок самая слабая? У автора меньше всего нужных кубиков в руке.',
      options,
      answer: String(w.n),
      explain: `Нужных кубиков у авторов${cond}: ${detail}. Меньше всего у ${seatLabel(round, w.s)}.`,
    };
  }
  return null;
}

/**
 * Проверка ответа на вопрос с точным совпадением (кнопки, выбор игрока или ставки).
 * @returns {{ok:boolean, points:number, max:number}}
 */
export function gradeQuestion(question, value) {
  const ok = !!question && value === question.answer;
  return { ok, points: ok ? 1 : 0, max: 1 };
}
