// tests/stats_summary.test.js — итоги «Результатов»: счётчики и защита от процентов по малой выборке.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, rateOf, MIN_DECISIONS_FOR_RATE, MIN_GAMES_FOR_RATE } from '../src/stats_summary.js';

describe('rateOf', () => {
  test('доля есть только когда данных достаточно', () => {
    assert.deepEqual(rateOf(3, 7, 8), { n: 7, good: 3, enough: false, rate: null });
    assert.deepEqual(rateOf(4, 8, 8), { n: 8, good: 4, enough: true, rate: 0.5 });
    assert.equal(rateOf(0, 0, 8).rate, null);
    assert.equal(rateOf(0, 0, 0).rate, null);          // деления на ноль нет даже при минимуме 0
  });
  test('мусор не ломает расчёт: верных не больше, чем всего', () => {
    assert.deepEqual(rateOf(99, 10, 8), { n: 10, good: 10, enough: true, rate: 1 });
    for (const bad of [undefined, null, -1, 1.5, 'x', NaN]) {
      const r = rateOf(bad, bad, 8);
      assert.equal(r.n, 0);
      assert.equal(r.rate, null);
    }
  });
});

describe('summarize', () => {
  test('пустые данные: нули и никаких процентов', () => {
    const s = summarize();
    assert.deepEqual(s.games, { total: 0, wins: 0, n: 0, good: 0, enough: false, rate: null });
    assert.equal(s.trainer.rate, null);
    assert.equal(s.queue, 0);
  });
  test('пороги согласованы со слабыми темами', () => {
    assert.equal(MIN_DECISIONS_FOR_RATE, 8);
    assert.equal(MIN_GAMES_FOR_RATE, 5);
  });
  test('одна проигранная партия — не «0.0%», а мало данных', () => {
    const s = summarize({ stats: { totalGames: 1, totalWins: 0 }, games: [{ won: false }] });
    assert.equal(s.games.total, 1);
    assert.equal(s.games.wins, 0);
    assert.equal(s.games.rate, null);
  });
  test('партии берутся из счётчиков, они не ограничены длиной истории', () => {
    const s = summarize({ stats: { totalGames: 300, totalWins: 120 }, games: Array(200).fill({ won: true }) });
    assert.equal(s.games.total, 300);
    assert.equal(s.games.wins, 120);
    assert.equal(s.games.rate, 0.4);
  });
  test('счётчики отстают от истории — считаем по истории', () => {
    const games = [{ won: true }, { won: false }, { won: true }, { won: true }, { won: false }];
    const s = summarize({ stats: {}, games });
    assert.equal(s.games.total, 5);
    assert.equal(s.games.wins, 3);
    assert.equal(s.games.rate, 0.6);
  });
  test('побед не больше партий', () => {
    assert.equal(summarize({ stats: { totalGames: 2, totalWins: 9 }, games: [] }).games.wins, 2);
  });
  test('тренажёр и очередь повторов', () => {
    const s = summarize({ stats: { n: 20, good: 15 }, queue: [1, 2, 3] });
    assert.equal(s.trainer.rate, 0.75);
    assert.equal(s.queue, 3);
    assert.equal(summarize({ stats: { n: 4, good: 2 } }).trainer.rate, null);
    assert.equal(summarize({ queue: 'x' }).queue, 0);
  });
});
