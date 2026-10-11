import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, applyAction } from '../src/engine.js';

// Партия 3 игрока, руки и ставка заданы вручную — результат детерминирован.
function setup({ calza = false, palifico = false } = {}) {
  const g = createGame({ botCount: 2, startDice: 3, calzaEnabled: calza, palificoEnabled: palifico, botNames: ['Иван', 'Мария'] });
  startGame(g);
  g.players[0].hand = [2, 3, 5];       // human
  g.players[1].hand = [5, 5, 1];       // Иван
  g.players[2].hand = [4, 6, 2];       // Мария
  g.currentPlayer = 0;
  g.bid = { playerId: 'bot_0', playerName: 'Иван', q: 3, f: 5 };
  return g;
}

test('dudo: DICE_REVEALED содержит руки всех живых и участников', () => {
  const g = setup();
  const res = applyAction(g, 'human', { type: 'dudo' });
  assert.equal(res.success, true);
  const ev = res.events.find((e) => e.type === 'DICE_REVEALED');
  assert.equal(ev.kind, 'dudo');
  assert.deepEqual(ev.hands.map((h) => h.playerId), ['human', 'bot_0', 'bot_1']);
  assert.deepEqual(ev.hands[0].hand, [2, 3, 5]);
  assert.deepEqual(ev.hands[1].hand, [5, 5, 1]);
  assert.equal(ev.actualCount, 4);          // 5,5(+1 джокер),5 человека
  assert.equal(ev.bidSuccessful, true);
  assert.equal(ev.challengerId, 'human');
  assert.equal(ev.bidderId, 'bot_0');
  assert.equal(ev.loserId, 'human');
  assert.equal(ev.wild, true);
});

test('снимок рук — копия: новая раздача его не меняет', () => {
  const g = setup();
  const res = applyAction(g, 'human', { type: 'dudo' });
  const ev = res.events.find((e) => e.type === 'DICE_REVEALED');
  assert.deepEqual(ev.hands[1].hand, [5, 5, 1]);
  g.players[1].hand.push(6);
  assert.deepEqual(ev.hands[1].hand, [5, 5, 1]);
});

test('dudo: ставка неверна — проигрывает автор ставки', () => {
  const g = setup();
  g.bid = { playerId: 'bot_0', playerName: 'Иван', q: 6, f: 5 };
  const ev = applyAction(g, 'human', { type: 'dudo' }).events.find((e) => e.type === 'DICE_REVEALED');
  assert.equal(ev.bidSuccessful, false);
  assert.equal(ev.loserId, 'bot_0');
});

test('palifico: wild=false и единицы не считаются', () => {
  const g = setup({ palifico: true });
  g.palifico = true;
  const ev = applyAction(g, 'human', { type: 'dudo' }).events.find((e) => e.type === 'DICE_REVEALED');
  assert.equal(ev.wild, false);
  assert.equal(ev.actualCount, 3);
});

test('calza: kind, участники, руки', () => {
  const g = setup({ calza: true });
  g.bid = { playerId: 'bot_0', playerName: 'Иван', q: 4, f: 5 };
  const res = applyAction(g, 'human', { type: 'calza' });
  assert.equal(res.success, true);
  const ev = res.events.find((e) => e.type === 'DICE_REVEALED');
  assert.equal(ev.kind, 'calza');
  assert.equal(ev.calzaExact, true);
  assert.equal(ev.challengerId, 'human');
  assert.equal(ev.bidderId, 'bot_0');
  assert.equal(ev.hands.length, 3);
});

test('выбывшие игроки в снимок не попадают', () => {
  const g = setup();
  g.players[2].alive = false;
  g.players[2].dice = 0;
  g.players[2].hand = [];
  const ev = applyAction(g, 'human', { type: 'dudo' }).events.find((e) => e.type === 'DICE_REVEALED');
  assert.deepEqual(ev.hands.map((h) => h.playerId), ['human', 'bot_0']);
});
