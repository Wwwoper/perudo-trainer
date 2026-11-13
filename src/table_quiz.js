// table_quiz.js — викторина «Читай стол»: вопросы по одному раунду и проверка ответов.
//
// Чистый модуль. Вопрос — простой объект без разметки; интерфейс рисует его сам. Каждый вид вопроса — отдельная
// функция build…(round), которая возвращает вопрос или null, если раунд для него не годится.
// Общая форма вопроса:
//   { kind, input: 'two'|'player'|'bid'|'number', title, options?, answer, explain }
// Ответ проверяет gradeQuestion: { ok, points, max }.

import { seatLabel } from './read_drill.js';
import { countFace } from './rounds.js';
import { bidOf, genitive } from './names_ru.js';

export const KIND_LAST_TRUE = 'lastTrue';
export const KIND_WEAKEST_BID = 'weakestBid';
/** Сколько ставок показывается в вопросе «При какой ставке меньше всего нужных кубиков в руке игрока?». */
export const WEAK_CHOICES = 3;
export const KIND_WHO_HOLDS_MORE = 'whoHoldsMore';
export const KIND_COUNT_FACE = 'countFace';
/** «у Юлии»; для имени без формы без склонения: «у игрока Ник». */
const atWho = (name) => { const g = genitive(name); return g ? `у ${g}` : `у игрока ${name}`; };
const GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Грань как символ кубика (⚃). */
export const faceGlyph = (f) => GLYPH[f] ?? String(f);

/**
 * «Последняя ставка верна?» — две кнопки. Берутся раунды, где ставку проверили («Не верю»),
 * а её игрок — не вы. Ответ: 'yes', если нужных кубиков на столе хватило.
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
  const g = faceGlyph(last.f);
  const lines = [ok
    ? `На столе было ${actual} × ${g} ${actual === last.q ? `из ${last.q}` : `при ставке ${last.q}`}.`
    : `На столе было ${actual} × ${g} из ${last.q}: ставки не хватило.`];
  return {
    kind: KIND_LAST_TRUE,
    input: 'two',
    title: `${bidOf(name).replace(/^./, (c) => c.toUpperCase())} — ${last.q} × ${faceGlyph(last.f)}. Она верна?`,
    short: 'Последняя ставка верна?',
    bid: { s: last.s, q: last.q, f: last.f, name },
    options: [{ v: 'yes', label: 'Верна' }, { v: 'no', label: 'Не верна' }],
    answer: ok ? 'yes' : 'no',
    lines,
    explain: lines.join(' '),
  };
}

/**
 * «У кого из авторов меньше всего нужных кубиков?» — выбор одной из трёх чужих ставок. Слабая — та, у автора которой в руке меньше
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
    // у одного игрока может быть две ставки из тройки, поэтому строки подписаны номером ставки
    const perBid = pick.map((x) => `Ставка ${x.n} · ${seatLabel(round, x.s)} — ${x.has} из ${hands[x.s].length} ${faceGlyph(x.f)}`);
    const lines = [`Минимум был ${atWho(seatLabel(round, w.s))}.`, ...perBid];
    return {
      kind: KIND_WEAKEST_BID,
      input: 'bid',
      title: 'При какой ставке меньше всего нужных кубиков в руке игрока?',
      short: 'При какой ставке меньше всего нужных кубиков?',
      options,
      answer: String(w.n),
      lines,
      linesOk: perBid,   // при верном ответе «Минимум был у…» повторяло бы ваш выбор
      explain: lines.join(' '),
    };
  }
  return null;
}

/**
 * «У кого больше кубиков со своей цифрой?» — выбор из двух соперников. Своя цифра игрока — та, что он назвал
 * в своей последней ставке; считаются кубики этой цифры в его руке (с учётом джокеров). Ничьи не берутся. Берутся
 * только игроки с одинаковым числом кубиков в начале раунда, иначе ответ угадывается по размеру руки.
 * @returns {object|null}
 */
export function buildWhoHoldsMore(round, rnd = Math.random) {
  const bids = Array.isArray(round?.bids) ? round.bids : [];
  const hands = Array.isArray(round?.hands) ? round.hands : [];
  const last = new Map();
  for (const b of bids) if (b && b.s !== round.me && Array.isArray(hands[b.s])) last.set(b.s, b);
  const rows = [...last.entries()].sort((a, b) => a[0] - b[0]).map(([seat, b]) => ({
    s: seat, f: b.f, q: b.q, size: hands[seat].length, has: countFace([hands[seat]], b.f, round.wild),
  }));
  // Только пары с одинаковым числом кубиков в руке: иначе «у кого рука больше» почти всегда угадывает ответ.
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].has !== rows[j].has && rows[i].size === rows[j].size) pairs.push([rows[i], rows[j]]);
    }
  }
  if (!pairs.length) return null;
  const [a, b] = pairs[Math.floor(rnd() * pairs.length)];
  const winner = a.has > b.has ? a : b;
  const na = seatLabel(round, a.s);
  const nb = seatLabel(round, b.s);
  const part = (x, name) => `${name} — ${x.has} × ${faceGlyph(x.f)}`;
  return {
    kind: KIND_WHO_HOLDS_MORE,
    input: 'player',
    short: `Кто держит больше: ${na} или ${nb}`,
    title: `Кто держит больше своей цифры: ${na} или ${nb}? Своя цифра — из последней ставки игрока.`,
    options: [a, b].map((x) => ({ v: String(x.s), s: x.s, f: x.f, name: seatLabel(round, x.s), label: `${seatLabel(round, x.s)} (${faceGlyph(x.f)})` })),
    answer: String(winner.s),
    lines: [`Больше ${atWho(seatLabel(round, winner.s))}.`, `В руках: ${part(a, na)}, ${part(b, nb)}.`],
    linesOk: [`В руках: ${part(a, na)}, ${part(b, nb)}.`],
    explain: `Больше ${atWho(seatLabel(round, winner.s))}. В руках: ${part(a, na)}, ${part(b, nb)}.`,
  };
}

/**
 * «Сколько всего кубиков цифры на столе?» — число. Цифра — одна из названных в ставках раунда; считаются кубики
 * всех игроков, включая ваши, с учётом джокеров. Ответ задаётся кнопками «−» и «+»: range — границы,
 * счётчик начинается с нуля.
 * @returns {object|null}
 */
export function buildCountFace(round, rnd = Math.random) {
  const bids = Array.isArray(round?.bids) ? round.bids : [];
  const hands = Array.isArray(round?.hands) ? round.hands : [];
  if (!bids.length || !hands.length || !hands.every(Array.isArray)) return null;
  const faces = [...new Set(bids.filter((b) => b && Number.isInteger(b.f) && b.f >= 1 && b.f <= 6).map((b) => b.f))];
  if (!faces.length) return null;
  const f = faces[Math.floor(rnd() * faces.length)];
  const total = hands.reduce((a, h) => a + h.length, 0);
  const answer = countFace(hands, f, round.wild);
  const per = hands.map((h, s) => `${seatLabel(round, s)} — ${countFace([h], f, round.wild)}`).join(', ');
  return {
    kind: KIND_COUNT_FACE,
    input: 'number',
    title: `Сколько всего ${faceGlyph(f)} на столе?`,
    short: `Сколько ${faceGlyph(f)} на столе?`,
    face: f,
    range: { min: 0, max: total },
    answer,
    lines: [`На столе было ${answer} × ${faceGlyph(f)}: ${per}.`],
    linesOk: [`По рукам: ${per}.`],   // число вы уже назвали верно, повторять его не нужно
    explain: `На столе было ${answer} × ${faceGlyph(f)}: ${per}.`,
  };
}

/**
 * Что вы ответили, для разбора: «Вы ответили: не верна», «Вы выбрали: Андрей: 1 × ⚃», «Вы сказали: 4 × ⚂».
 * Без ответа или с неизвестным вариантом возвращает null.
 * @returns {string|null}
 */
export function youSaid(question, value) {
  if (!question || value === undefined || value === null || value === '') return null;
  if (question.input === 'number') {
    const v = Number(value);
    return Number.isFinite(v) ? `Вы сказали: ${v} × ${faceGlyph(question.face)}` : null;
  }
  const opt = (question.options || []).find((o) => String(o.v) === String(value));
  if (!opt) return null;
  if (question.input === 'two') return `Вы ответили: ${opt.label.replace(/^./, (c) => c.toLowerCase())}`;
  return `Вы выбрали: ${opt.label}`;
}

/**
 * Проверка ответа. Для кнопок, выбора игрока или ставки — точное совпадение (1 балл).
 * Для числа: точно — 2 балла, ошибка в один кубик — 1 балл, иначе 0.
 * @returns {{ok:boolean, points:number, max:number}}
 */
export function gradeQuestion(question, value) {
  if (question?.input === 'number') {
    const v = Number(value);
    const diff = Number.isFinite(v) && value !== '' && value !== null ? Math.abs(v - question.answer) : Infinity;
    return { ok: diff === 0, points: diff === 0 ? 2 : (diff === 1 ? 1 : 0), max: 2 };
  }
  const ok = !!question && value === question.answer;
  return { ok, points: ok ? 1 : 0, max: 1 };
}

/** Виды вопросов первой версии: строители по порядку. */
export const BUILDERS = Object.freeze({
  [KIND_LAST_TRUE]: buildLastTrue,
  [KIND_WEAKEST_BID]: buildWeakestBid,
  [KIND_WHO_HOLDS_MORE]: buildWhoHoldsMore,
  [KIND_COUNT_FACE]: buildCountFace,
});
/** Сколько вопросов задаётся к одному столу и сколько из них может быть одного вида. */
export const PER_TABLE = 4;
export const MAX_PER_KIND = 2;

/**
 * Подбирает вопросы к одному столу: случайные из подходящих видов, не больше MAX_PER_KIND одного вида,
 * без повторов. Порядок вопросов случайный. Если раунд даёт меньше вопросов, возвращается сколько нашлось.
 * @param {object} round раунд в формате rounds.js
 * @returns {object[]} вопросы
 */
export function pickTableQuestions(round, { rnd = Math.random, count = PER_TABLE, maxPerKind = MAX_PER_KIND } = {}) {
  const kinds = Object.keys(BUILDERS);
  const used = Object.fromEntries(kinds.map((k) => [k, 0]));
  const dead = new Set();
  const seen = new Set();
  const out = [];
  for (let tries = 0; tries < 60 && out.length < count; tries++) {
    const open = kinds.filter((k) => used[k] < maxPerKind && !dead.has(k));
    if (!open.length) break;
    // сначала виды, которых в этом столе ещё нет: так вопросы разных видов чередуются, а не всегда «Сколько на столе»
    const least = Math.min(...open.map((k) => used[k]));
    const fresh = open.filter((k) => used[k] === least);
    const kind = fresh[Math.floor(rnd() * fresh.length)];
    const q = BUILDERS[kind](round, rnd);
    if (!q) { dead.add(kind); continue; }
    if (seen.has(q.title)) continue;                 // тот же вопрос второй раз не задаём
    seen.add(q.title);
    used[kind]++;
    out.push(q);
  }
  for (let i = out.length - 1; i > 0; i--) {         // перемешивание Фишера — Йетса
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Хватает ли раунду вопросов на целый стол (PER_TABLE штук). */
export function canQuiz(round, opts = {}) {
  return pickTableQuestions(round, opts).length >= (opts.count ?? PER_TABLE);
}
