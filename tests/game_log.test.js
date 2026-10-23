// game_log.test.js — строки журнала по событиям движка.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeRoundEvents } from '../src/game_log.js';
import { createGame, startGame, applyAction } from '../src/engine.js';

const players = [
  { id: 'human', name: 'Вы' },
  { id: 'bot_1', name: 'Дмитрий' },
  { id: 'bot_2', name: 'Анна' },
];

describe('describeRoundEvents', () => {
  it('потеря кубика: с остатком, без рода в глаголе', () => {
    const r = describeRoundEvents([{ type: 'PLAYER_LOST_DIE', playerId: 'bot_2', newDiceCount: 2 }], players);
    assert.deepEqual(r, [{ type: 'loss', text: 'Анна теряет кубик (осталось: 2).' }]);
  });
  it('про человека — «Вы теряете»', () => {
    const r = describeRoundEvents([{ type: 'PLAYER_LOST_DIE', playerId: 'human', newDiceCount: 3 }], players);
    assert.equal(r[0].text, 'Вы теряете кубик (осталось: 3).');
  });
  it('последний кубик: одна запись о выбывании, без «осталось: 0»', () => {
    const r = describeRoundEvents([
      { type: 'PLAYER_LOST_DIE', playerId: 'bot_1', newDiceCount: 0 },
      { type: 'PLAYER_ELIMINATED', playerId: 'bot_1' },
    ], players);
    assert.deepEqual(r, [{ type: 'elim', text: '✖ Дмитрий остаётся без кубиков и выбывает из игры.' }]);
  });
  it('выбывание человека', () => {
    const r = describeRoundEvents([{ type: 'PLAYER_ELIMINATED', playerId: 'human' }], players);
    assert.equal(r[0].text, '✖ Вы остаётесь без кубиков и выбываете из игры.');
  });
  it('Calza: результат и получение кубика', () => {
    const r = describeRoundEvents([
      { type: 'DICE_REVEALED', kind: 'calza', bid: { q: 4, f: 3 }, actualCount: 4, calzaExact: true },
      { type: 'PLAYER_GAINED_DIE', playerId: 'bot_2', newDiceCount: 3 },
    ], players);
    assert.deepEqual(r.map((x) => x.text), ['Calza: на столе 4 из 4 — точно.', 'Анна получает кубик (стало: 3).']);
  });
  it('обычная проверка не дублируется здесь (её пишет «Проверка: …»)', () => {
    assert.deepEqual(describeRoundEvents([{ type: 'DICE_REVEALED', kind: 'dudo', bid: { q: 1, f: 2 }, actualCount: 0 }], players), []);
  });
  it('мусор и неизвестный игрок не ломают', () => {
    assert.deepEqual(describeRoundEvents(null, players), []);
    assert.deepEqual(describeRoundEvents([null, 5, { type: 'X' }], players), []);
    assert.equal(describeRoundEvents([{ type: 'PLAYER_ELIMINATED', playerId: 'zzz' }], players)[0].text, '✖ Игрок остаётся без кубиков и выбывает из игры.');
  });
});

describe('с настоящим движком', () => {
  it('«Не верю» при одном кубике у проигравшего даёт запись о выбывании', () => {
    const game = createGame({ botCount: 2, startDice: 1 });
    startGame(game);
    // ставка заведомо ложная: на столе нет ни одной шестёрки
    game.players.forEach((p) => { p.hand = [2]; });
    const bidder = game.players[game.currentPlayer];
    applyAction(game, bidder.id, { type: 'raise', quantity: 3, face: 6 });
    const challenger = game.players[game.currentPlayer];
    const res = applyAction(game, challenger.id, { type: 'dudo' });
    const lines = describeRoundEvents(res.events, game.players, 'human');
    const elim = lines.find((l) => l.type === 'elim');
    assert.ok(elim, JSON.stringify(lines));
    assert.match(elim.text, /выбыва/);
  });
});
