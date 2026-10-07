// engine.test.js — тесты для engine.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGame, startGame, applyAction, getLegalActions, getPublicState } from '../src/engine.js';

describe('GameEngine — создание', () => {
  it('создаёт партию 1+1', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 5 });
    assert.strictEqual(g.players.length, 2);
  });
  it('создаёт партию на 6 игроков', () => {
    const g = createGame({ playerId: 'human', botCount: 5, startDice: 5 });
    assert.strictEqual(g.players.length, 6);
  });
});

describe('GameEngine — старт', () => {
  it('стартует партию', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(g);
    assert.strictEqual(g.state, 'active');
    assert.strictEqual(g.round, 1);
  });
});

describe('GameEngine — действия', () => {
  it('возвращает допустимые действия', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(g);
    const actions = getLegalActions(g, 'human');
    assert.ok(actions.length > 0);
  });
  it('применяет ставку', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(g);
    const r = applyAction(g, 'human', { type: 'raise', quantity: 2, face: 3 });
    assert.strictEqual(r.success, true);
  });
  it('отклоняет недопустимую ставку', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(g);
    const r = applyAction(g, 'human', { type: 'raise', quantity: 1, face: 1 });
    assert.strictEqual(r.success, false);
  });
});

describe('GameEngine — публичное состояние', () => {
  it('возвращает состояние без рук', () => {
    const g = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(g);
    const s = getPublicState(g);
    assert.ok(!s.players[0].hand);
  });
});
