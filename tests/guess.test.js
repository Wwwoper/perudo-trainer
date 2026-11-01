import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canGuess, makeGuess, guessMatchesBid, checkGuess, guessLine, addGuessToTally, tallyText, addGuessToStats, GUESS_ANSWERS,
} from '../src/guess.js';

const BANNED = /обманщик|врёт|врет|блеф|обман|лжец/i;
const ids = ['human', 'b1', 'b2'];
// раунд: я — место 0; последнюю ставку 3×4 назвал b2 (место 2)
const round = (hands, wild = true) => ({
  round: 3, wild, me: 0, hands,
  bids: [{ s: 1, q: 2, f: 4 }, { s: 2, q: 3, f: 4 }],
});

describe('canGuess', () => {
  it('только чужая корректная ставка', () => {
    assert.equal(canGuess({ playerId: 'b1', q: 2, f: 4 }), true);
    assert.equal(canGuess({ playerId: 'human', q: 2, f: 4 }), false);
    for (const bad of [null, undefined, {}, { playerId: 'b1', q: 0, f: 4 }, { playerId: 'b1', q: 2, f: 7 }, { playerId: 'b1', q: 2.5, f: 4 }]) {
      assert.equal(canGuess(bad), false, JSON.stringify(bad));
    }
  });
});

describe('makeGuess / guessMatchesBid', () => {
  const bid = { playerId: 'b2', q: 3, f: 4 };
  it('запоминает автора, ставку и ответ', () => {
    const g = makeGuess({ round: 3, bid, answer: 'has' });
    assert.deepEqual(g, { round: 3, id: 'b2', q: 3, f: 4, answer: 'has' });
    assert.equal(guessMatchesBid(g, 3, bid), true);
  });
  it('не подходит к другой ставке, другому автору и другому раунду', () => {
    const g = makeGuess({ round: 3, bid, answer: 'none' });
    assert.equal(guessMatchesBid(g, 4, bid), false);
    assert.equal(guessMatchesBid(g, 3, { ...bid, q: 4 }), false);
    assert.equal(guessMatchesBid(g, 3, { ...bid, playerId: 'b1' }), false);
    assert.equal(guessMatchesBid(null, 3, bid), false);
  });
  it('мусор не принимается', () => {
    assert.equal(makeGuess({ round: 3, bid, answer: 'maybe' }), null);
    assert.equal(makeGuess({ round: 'x', bid, answer: 'has' }), null);
    assert.equal(makeGuess({ round: 3, bid: { playerId: 'human', q: 1, f: 2 }, answer: 'has' }), null);
    assert.deepEqual(GUESS_ANSWERS, ['has', 'none']);
  });
});

describe('checkGuess', () => {
  const g = (answer) => ({ round: 3, id: 'b2', q: 3, f: 4, answer });
  it('цифра есть: верно «has», неверно «none»; единицы-джокеры считаются', () => {
    const r = round([[2, 2], [5, 5], [4, 1, 6]]);
    const a = checkGuess(g('has'), r, ids);
    assert.equal(a.ok, true); assert.equal(a.matches, 2); assert.equal(a.size, 3);
    assert.equal(checkGuess(g('none'), r, ids).ok, false);
  });
  it('цифры нет: верно «none»', () => {
    const r = round([[2, 2], [5, 5], [3, 6]]);
    const a = checkGuess(g('none'), r, ids);
    assert.equal(a.ok, true); assert.equal(a.has, false); assert.equal(a.matches, 0);
    assert.equal(checkGuess(g('has'), r, ids).ok, false);
  });
  it('Палифико: единицы не заменяют цифру', () => {
    const r = round([[2], [5], [1, 6]], false);
    assert.equal(checkGuess(g('none'), r, ids).ok, true);
  });
  it('догадка по другой ставке или по своей ставке не засчитывается', () => {
    const r = round([[2], [5], [4]]);
    assert.equal(checkGuess({ ...g('has'), q: 2 }, r, ids), null);
    assert.equal(checkGuess({ ...g('has'), id: 'b1' }, r, ids), null);
    assert.equal(checkGuess({ ...g('has'), id: 'human' }, { ...r, bids: [{ s: 0, q: 3, f: 4 }] }, ids), null);
    assert.equal(checkGuess(g('has'), r, ['human', 'b1']), null);
  });
  it('мусор вместо данных даёт null и не падает', () => {
    for (const [gg, rr, ii] of [[null, round([[1], [1], [1]]), ids], [g('has'), null, ids], [g('has'), { bids: [] }, ids],
      [g('has'), { bids: [{ s: 2, q: 3, f: 4 }], hands: 'x', me: 0 }, ids], [g('has'), round([[1], [1], null]), ids], [g('has'), round([[1], [1], [4]]), null]]) {
      assert.equal(checkGuess(gg, rr, ii), null);
    }
  });
});

describe('тексты и счётчики', () => {
  it('строка догадки без запрещённых слов, в обоих исходах', () => {
    const base = { q: 3, f: 4, seat: 2 };
    for (const res of [{ ...base, ok: true, has: true, matches: 2, size: 3 }, { ...base, ok: false, has: false, matches: 0, size: 3 },
      { ...base, ok: true, has: false, matches: 0, size: 2 }, { ...base, ok: false, has: true, matches: 1, size: 1 }]) {
      const t = guessLine(res, 'Сергей');
      assert.match(t, /Ваша догадка: (верно|неверно)\. Ставка 3×4, у Сергей /);
      assert.doesNotMatch(t, BANNED);
      assert.doesNotMatch(t, /undefined|NaN/);
    }
    assert.equal(guessLine(null, 'x'), '');
  });
  it('счётчик за партию: прибавляет, не меняет исходный, мусор = нули', () => {
    const a = addGuessToTally(undefined, true);
    assert.deepEqual(a, { n: 1, good: 1 });
    const t = { n: 2, good: 1 };
    assert.deepEqual(addGuessToTally(t, false), { n: 3, good: 1 });
    assert.deepEqual(t, { n: 2, good: 1 });
    assert.deepEqual(addGuessToTally({ n: 'x', good: 9 }, true), { n: 1, good: 1 });
    assert.equal(tallyText({ n: 3, good: 2 }), 'Догадок в этой партии: 2 из 3.');
    assert.equal(tallyText({ n: 0, good: 0 }), '');
    assert.equal(tallyText(null), '');
  });
  it('в статистику идёт как один ответ темы «чтение ставок»', () => {
    const s = addGuessToStats({ endgame: { n: 1, good: 1 } }, true);
    assert.deepEqual(s.read, { n: 1, good: 1 });
    assert.deepEqual(addGuessToStats(s, false).read, { n: 2, good: 1 });
    assert.deepEqual(s.endgame, { n: 1, good: 1 });
  });
});
