// quiz_reader.js — «читающий»: простые правила ответа на вопросы викторины по тому, что видно игроку.
//
// Чистый модуль, нужен для проверки качества вопросов, а не для игры. Читающий видит то же, что и вы:
// свои кубики, число кубиков у каждого, ставки и цифру, на которой проверили. Чужие руки ему недоступны:
// visibleView стирает их, а тесты прогоняют читающего именно на таком урезанном раунде.
// Если читающий не обгоняет лучшую постоянную догадку, вопрос нельзя решить чтением ставок, его надо менять.

import {
  KIND_LAST_TRUE, KIND_WEAKEST_BID, KIND_WHO_HOLDS_MORE, KIND_COUNT_FACE,
} from './table_quiz.js';

/** Раунд глазами игрока: чужие руки заменены на null. */
export function visibleView(round) {
  return {
    me: round.me, wild: round.wild, dice: round.dice, bids: round.bids,
    hands: round.hands.map((h, i) => (i === round.me ? h : null)),
  };
}

const faceProb = (wild, f) => (wild && f !== 1 ? 1 / 3 : 1 / 6);
const mineOf = (v, f) => v.hands[v.me].filter((d) => d === f || (v.wild && d === 1 && f !== 1)).length;

function binomial(n, p) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    out.push(c * p ** k * (1 - p) ** (n - k));
  }
  return out;
}

const convolve = (a, b) => {
  const out = Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
};

/** Вероятность, что ставка верна: ваши кубики известны, у автора цифра вероятнее, чем у остальных. */
export function bidTrueChance(v, bid) {
  let d = [1];
  v.dice.forEach((k, i) => {
    if (i === v.me) return;
    d = convolve(d, binomial(k, i === bid.s ? 0.5 : faceProb(v.wild, bid.f)));
  });
  const need = bid.q - mineOf(v, bid.f);
  return d.reduce((a, x, k) => (k >= need ? a + x : a), 0);
}

const timesNamed = (v, s, f) => v.bids.filter((b) => b.s === s && b.f === f).length;
const lastBidOf = (v, s) => v.bids.filter((b) => b.s === s).pop();

/** Правила чтения по видам вопросов: (вопрос, видимый раунд) → ответ. */
export const READERS = Object.freeze({
  // Последняя ставка верна, если шанс высок; чуть строже половины: проверяют чаще сомнительные ставки.
  [KIND_LAST_TRUE]: (q, v) => (bidTrueChance(v, q.bid) >= 0.6 ? 'yes' : 'no'),
  // Слабее всего ставка на цифру, которую автор называл реже всего (при равенстве — меньшая по количеству).
  [KIND_WEAKEST_BID]: (q, v) => {
    const key = (o) => timesNamed(v, o.s, o.f) * 100 + o.q;
    return q.options.reduce((a, o) => (key(o) < key(a) ? o : a), q.options[0]).v;
  },
  // У кого больше: тот, чья последняя ставка крупнее; при равенстве — первый вариант.
  [KIND_WHO_HOLDS_MORE]: (q, v) => {
    const [a, b] = q.options;
    return (lastBidOf(v, b.s).q > lastBidOf(v, a.s).q ? b : a).v;
  },
  // Число: свои кубики + ожидаемое у остальных + немного за каждого соперника, назвавшего эту цифру.
  [KIND_COUNT_FACE]: (q, v) => {
    const others = v.dice.reduce((a, k) => a + k, 0) - v.dice[v.me];
    const named = new Set(v.bids.filter((b) => b.s !== v.me && b.f === q.face).map((b) => b.s)).size;
    const est = Math.round(mineOf(v, q.face) + others * faceProb(v.wild, q.face) + 0.25 * named);
    return Math.max(q.range.min, Math.min(q.range.max, est));
  },
});

/** Ответ читающего на вопрос; null, если для вида вопроса правила нет. */
export function readerAnswer(question, round) {
  const fn = READERS[question.kind];
  return fn ? fn(question, visibleView(round)) : null;
}
