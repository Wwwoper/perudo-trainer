// Правила движка, на которые опирается README: Calza на свою ставку,
// границы createGame и кто ходит первым в новом раунде.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, applyAction, canCalza, getLegalActions, LIMITS } from '../src/engine.js';

// 3 игрока (human, bot_0, bot_1) по 3 кубика. Ставка bot_0: 3×5 — на столе 4 пятёрки (две 5 и джокер у bot_0, одна у human).
function setup({ calza = true, palifico = false, playerId } = {}) {
  const g = createGame({ botCount: 2, startDice: 3, calzaEnabled: calza, palificoEnabled: palifico, ...(playerId ? { playerId } : {}) });
  startGame(g);
  g.palifico = false;
  g.players[0].hand = [2, 3, 5];
  g.players[1].hand = [5, 5, 1];
  g.players[2].hand = [4, 6, 2];
  g.currentPlayer = 0;
  g.bid = { playerId: g.players[1].id, playerName: 'Иван', q: 3, f: 5 };
  return g;
}

// ---------- canCalza ----------

test('canCalza: на чужую ставку можно', () => {
  assert.equal(canCalza(setup()), true);
});

test('canCalza: на собственную ставку нельзя (playerId = human)', () => {
  const g = setup();
  g.bid.playerId = 'human';
  g.currentPlayer = 0;
  assert.equal(canCalza(g), false);
});

test('canCalza: id игрока не обязан быть «human»', () => {
  const g = setup({ playerId: 'p1' });
  assert.equal(g.players[0].id, 'p1');
  assert.equal(canCalza(g), true);
  g.bid.playerId = 'p1';
  assert.equal(canCalza(g), false, 'своя ставка при произвольном id');
  assert.equal(getLegalActions(g, 'p1').some((a) => a.type === 'calza'), false);
});

test('canCalza: бот тоже не может объявить Calza на свою ставку', () => {
  const g = setup();
  g.currentPlayer = 1;
  g.bid.playerId = g.players[1].id;
  assert.equal(canCalza(g), false);
});

test('canCalza: выключена опцией или нет ставки или мало кубиков', () => {
  assert.equal(canCalza(setup({ calza: false })), false);
  const g = setup();
  g.bid = null;
  assert.equal(canCalza(g), false);
  const h = setup();
  h.players[1].dice = 0; h.players[1].alive = false;
  h.players[2].dice = 1;                 // всего 3 + 1 = 4 < ceil(3·3/2) = 5
  assert.equal(canCalza(h), false);
});

// ---------- createGame: границы ----------

test('createGame: допустимые границы принимаются', () => {
  assert.doesNotThrow(() => createGame({ botCount: LIMITS.minBots, startDice: LIMITS.minDice }));
  assert.doesNotThrow(() => createGame({ botCount: LIMITS.maxBots, startDice: LIMITS.maxDice }));
  assert.doesNotThrow(() => createGame({}), 'значения по умолчанию');
});

test('createGame: startDice вне 1–10 или не целое — RangeError', () => {
  for (const startDice of [0, -1, 11, 2.5, NaN, '5']) {
    assert.throws(() => createGame({ startDice }), RangeError, `startDice=${startDice}`);
  }
});

test('createGame: botCount вне 1–5 или не целое — RangeError', () => {
  for (const botCount of [0, -1, 6, 1.5, NaN, '3']) {
    assert.throws(() => createGame({ botCount }), RangeError, `botCount=${botCount}`);
  }
});

// ---------- Кто ходит первым в новом раунде ----------

test('после «Не верю»: первым ходит проигравший проверку', () => {
  const g = setup();                      // ставка верна → кубик теряет сомневающийся (human)
  applyAction(g, 'human', { type: 'dudo' });
  assert.equal(g.players[0].dice, 2);
  assert.equal(g.currentPlayer, 0);
});

test('Calza верна: первым ходит автор ставки', () => {
  const g = setup();
  g.bid.q = 4;                            // на столе ровно 4 пятёрки
  applyAction(g, 'human', { type: 'calza' });
  assert.equal(g.players[0].dice, 3, 'кубик возвращён, но не выше стартового');
  assert.equal(g.currentPlayer, 1);
});

test('Calza неверна: первым ходит вызвавший', () => {
  const g = setup();                      // на столе 4, заявлено 3
  applyAction(g, 'human', { type: 'calza' });
  assert.equal(g.players[0].dice, 2);
  assert.equal(g.currentPlayer, 0);
});

test('Палифико: первым ходит игрок с одним кубиком', () => {
  const g = setup({ palifico: true });
  g.players[2].dice = 1; g.players[2].hand = [4];
  applyAction(g, 'human', { type: 'dudo' });   // проигрывает human, но раунд начинает bot_1
  assert.equal(g.palifico, true);
  assert.equal(g.currentPlayer, 2);
});

test('Палифико не включается, если за столом двое', () => {
  const g = createGame({ botCount: 1, startDice: 3, palificoEnabled: true });
  startGame(g);
  g.players[1].dice = 1; g.players[1].hand = [4];
  g.players[0].hand = [2, 3, 5];
  g.currentPlayer = 0;
  g.bid = { playerId: g.players[1].id, playerName: 'Бот', q: 1, f: 4 };
  applyAction(g, 'human', { type: 'dudo' });
  assert.equal(g.palifico, false);
});

test('повторное Палифико: верная Calza возвращает право на него (поведение описано в README)', () => {
  const g = setup({ palifico: true });
  const me = g.players[0];
  me.dice = 1; me.hand = [5]; me.palificoUsed = true;
  g.bid.q = 4;                            // 5, 5, 1 у bot_0 и 5 у human — ровно 4
  applyAction(g, 'human', { type: 'calza' });
  assert.equal(me.dice, 2);
  assert.equal(me.palificoUsed, false);
});

test('в состоянии игры нет неиспользуемых полей Палифико', () => {
  const g = createGame({ botCount: 1 });
  assert.equal('palificoStarter' in g, false);
  assert.equal('palificoFace' in g, false);
});
