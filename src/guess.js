// guess.js — необязательная догадка игрока перед вскрытием: была ли у автора последней ставки нужная цифра в руке.
//
// Чистый модуль: без DOM и хранилища. Догадка — ваше предположение о руке автора ставки, а не оценка вашего хода:
// «цифры в руке нет» не означает, что ставка нечестная, она могла опираться на чужие кубики.
// Результат копится в теме «чтение ставок» (byTag.read) вместе с упражнением «Читай вскрытие».

import { dieMatches } from './reveal.js';
import { addReadResult } from './read_drill.js';

export const GUESS_ANSWERS = ['has', 'none'];
export const GUESS_LABELS = { has: 'Цифра в руке есть', none: 'Цифры в руке нет' };

/**
 * Догадку можно сделать, пока на столе чужая ставка, а вы ещё не ответили на неё.
 * @param {{playerId: string, q: number, f: number}|null} bid текущая ставка
 * @param {string} meId id игрока-человека
 */
export function canGuess(bid, meId = 'human') {
  return !!bid && bid.playerId !== meId && Number.isInteger(bid.q) && Number.isInteger(bid.f) && bid.q > 0 && bid.f >= 1 && bid.f <= 6;
}

/**
 * Запомнить догадку по текущей ставке.
 * @returns {{round: number, id: string, q: number, f: number, answer: string}|null}
 */
export function makeGuess({ round, bid, answer, meId = 'human' }) {
  if (!GUESS_ANSWERS.includes(answer) || !canGuess(bid, meId) || !Number.isInteger(round)) return null;
  return { round, id: String(bid.playerId), q: bid.q, f: bid.f, answer };
}

/** Догадка относится к этой ставке: тот же автор, количество и цифра в том же раунде. */
export function guessMatchesBid(guess, round, bid) {
  return !!guess && !!bid && guess.round === round && guess.id === String(bid.playerId) && guess.q === bid.q && guess.f === bid.f;
}

/**
 * Проверить догадку по записанному раунду (после вскрытия руки известны).
 * @param {object} guess результат makeGuess
 * @param {object} round раунд из rounds.js (sanitizeRound): bids, hands, wild, me
 * @param {string[]} ids id игроков по местам раунда
 * @returns {{ok: boolean, has: boolean, matches: number, size: number, q: number, f: number, seat: number}|null}
 */
export function checkGuess(guess, round, ids) {
  if (!guess || !round || !Array.isArray(round.bids) || !round.bids.length || !Array.isArray(round.hands) || !Array.isArray(ids)) return null;
  const last = round.bids[round.bids.length - 1];
  const seat = ids.indexOf(guess.id);
  if (seat < 0 || last.s !== seat || last.q !== guess.q || last.f !== guess.f || seat === round.me) return null;
  const hand = round.hands[seat];
  if (!Array.isArray(hand)) return null;
  const matches = hand.filter((d) => dieMatches(d, last.f, round.wild)).length;
  const has = matches > 0;
  return { ok: (guess.answer === 'has') === has, has, matches, size: hand.length, q: last.q, f: last.f, seat };
}

/** Строка для окна вскрытия. Без слов «блеф» и «обман». */
export function guessLine(res, name) {
  if (!res) return '';
  const who = String(name || 'автора ставки');
  const fact = res.has ? `в руке ${res.matches} из ${res.size}` : 'в руке нужной цифры не было';
  return `Ваша догадка: ${res.ok ? 'верно' : 'неверно'}. Ставка ${res.q}×${res.f}, у ${who} ${fact}.`;
}

/** Счётчик догадок за партию. Исходный объект не меняется. */
export function addGuessToTally(tally, ok) {
  const n = Number.isInteger(tally?.n) && tally.n >= 0 ? tally.n : 0;
  const good = Number.isInteger(tally?.good) && tally.good >= 0 && tally.good <= n ? tally.good : 0;
  return { n: n + 1, good: good + (ok ? 1 : 0) };
}

export function tallyText(tally) {
  return tally && tally.n > 0 ? `Догадок в этой партии: ${tally.good} из ${tally.n}.` : '';
}

/** Записать результат догадки в byTag.read (одна догадка = один ответ упражнения). */
export function addGuessToStats(byTag, ok) {
  return addReadResult(byTag, { good: ok ? 1 : 0, total: 1 });
}
