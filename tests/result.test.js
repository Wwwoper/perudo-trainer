import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGameResult } from '../src/result.js';

const P = (id, o = {}) => ({ id, name: id, dice: 0, alive: false, isBot: true, ...o });
const game = (players, o = {}) => ({ state: 'finished', round: 28, winner: null, players, ...o });

test('null, если партия не завершена или данных нет', () => {
  assert.equal(buildGameResult(null), null);
  assert.equal(buildGameResult(undefined), null);
  assert.equal(buildGameResult({ state: 'active', players: [] }), null);
  assert.equal(buildGameResult({ state: 'finished' }), null);
});

test('победил человек', () => {
  const r = buildGameResult(game(
    [P('human', { name: 'Вы', isBot: false, alive: true, dice: 3 }), P('bot_0', { name: 'Иван' })],
    { winner: 'human' },
  ));
  assert.equal(r.winnerId, 'human');
  assert.equal(r.winnerName, 'Вы');
  assert.equal(r.isHumanWinner, true);
  assert.equal(r.humanAlive, true);
  assert.equal(r.humanDice, 3);
  assert.equal(r.rounds, 28);
});

test('победил бот: человек выбыл', () => {
  const r = buildGameResult(game(
    [P('human', { name: 'Вы', isBot: false }), P('bot_0', { name: 'Александр', alive: true, dice: 2 })],
    { winner: 'bot_0' },
  ));
  assert.equal(r.winnerName, 'Александр');
  assert.equal(r.isHumanWinner, false);
  assert.equal(r.humanAlive, false);
  assert.equal(r.humanDice, 0);
});

test('победитель определяется по единственному выжившему, если game.winner пуст', () => {
  const r = buildGameResult(game([P('human', { isBot: false }), P('bot_0', { name: 'Мария', alive: true, dice: 1 })]));
  assert.equal(r.winnerId, 'bot_0');
  assert.equal(r.winnerName, 'Мария');
});

test('нет победителя (нет выживших и game.winner пуст) — безопасные значения', () => {
  const r = buildGameResult(game([P('human', { isBot: false }), P('bot_0')]));
  assert.equal(r.winnerId, null);
  assert.equal(r.winnerName, '');
  assert.equal(r.isHumanWinner, false);
});

test('несколько выживших и пустой winner — победителя не придумываем', () => {
  const r = buildGameResult(game([P('a', { alive: true, dice: 2 }), P('b', { alive: true, dice: 1 })]));
  assert.equal(r.winnerId, null);
});

test('человек распознаётся и по isHuman, и по isBot === false', () => {
  const a = buildGameResult(game([P('x', { isHuman: true, isBot: undefined, alive: true }), P('y')], { winner: 'x' }));
  const b = buildGameResult(game([P('x', { isBot: false, alive: true }), P('y')], { winner: 'x' }));
  assert.equal(a.isHumanWinner, true);
  assert.equal(b.isHumanWinner, true);
});

test('таблица: выжившие первыми, затем по кубикам, порядок мест при равенстве стабилен', () => {
  const r = buildGameResult(game([
    P('h', { isBot: false, dice: 0 }),
    P('a', { dice: 0 }),
    P('b', { alive: true, dice: 2 }),
    P('c', { dice: 1 }),
  ], { winner: 'b' }));
  assert.deepEqual(r.standings.map((s) => s.id), ['b', 'c', 'h', 'a']);
  assert.equal(r.standings.find((s) => s.id === 'h').isHuman, true);
});

test('функция не мутирует состояние игры', () => {
  const g = game([P('h', { isBot: false }), P('b', { alive: true, dice: 2 })], { winner: 'b' });
  const snap = JSON.stringify(g);
  buildGameResult(g);
  assert.equal(JSON.stringify(g), snap);
});

test('имя не-строкового типа приводится к строке', () => {
  const r = buildGameResult(game([P('b', { alive: true, name: 42, dice: 1 }), P('h', { isBot: false })], { winner: 'b' }));
  assert.equal(r.winnerName, '42');
});

import { pluralDice, resultHeadline } from '../src/result.js';

test('pluralDice: склонение', () => {
  const cases = { 0: '0 кубиков', 1: '1 кубик', 2: '2 кубика', 4: '4 кубика', 5: '5 кубиков',
    11: '11 кубиков', 12: '12 кубиков', 14: '14 кубиков', 21: '21 кубик', 22: '22 кубика', 111: '111 кубиков' };
  for (const [n, s] of Object.entries(cases)) assert.equal(pluralDice(+n), s, n);
  assert.equal(pluralDice(undefined), '0 кубиков');
  assert.equal(pluralDice(-3), '3 кубика');
});

test('resultHeadline: победа человека, победа бота, без победителя, null', () => {
  const win = resultHeadline({ winnerId: 'h', winnerName: 'Вы', isHumanWinner: true, rounds: 12, humanAlive: true, humanDice: 3 });
  assert.equal(win.title, 'Вы победили!');
  assert.equal(win.icon, '🏆');
  assert.equal(win.lead, 'Раунд 12 · у вас осталось 3 кубика');

  const lose = resultHeadline({ winnerId: 'b', winnerName: 'Александр', isHumanWinner: false, rounds: 28, humanAlive: false, humanDice: 0 });
  assert.equal(lose.title, 'Победил Александр');
  assert.equal(lose.lead, 'Раунд 28 · вы выбыли');

  assert.equal(resultHeadline({ winnerId: null, winnerName: '', isHumanWinner: false, rounds: 1, humanAlive: false, humanDice: 0 }).title, 'Партия завершена');
  assert.deepEqual(resultHeadline(null), { icon: '', title: '', lead: '' });
});
