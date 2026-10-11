import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReveal, dieMatches } from '../src/reveal.js';
import { createGame, startGame, applyAction } from '../src/engine.js';

const players = [
  { id: 'human', name: 'Вы', isBot: false },
  { id: 'bot_0', name: 'Иван', isBot: true },
  { id: 'bot_1', name: 'Мария', isBot: true },
];
const hands = [
  { playerId: 'human', hand: [5, 3, 2] },
  { playerId: 'bot_0', hand: [5, 5, 1] },
  { playerId: 'bot_1', hand: [6, 4, 2] },
];
const dudo = (o = {}) => ({
  type: 'DICE_REVEALED', kind: 'dudo', bid: { q: 3, f: 5, playerId: 'bot_0', playerName: 'Иван' },
  actualCount: 4, bidSuccessful: true, wild: true,
  challengerId: 'human', bidderId: 'bot_0', loserId: 'human', hands, ...o,
});

test('dieMatches: джокеры только при wild и не для единиц', () => {
  assert.equal(dieMatches(5, 5, true), true);
  assert.equal(dieMatches(1, 5, true), true);
  assert.equal(dieMatches(1, 5, false), false);
  assert.equal(dieMatches(1, 1, true), true);
  assert.equal(dieMatches(4, 5, true), false);
});

test('null: нет события, нет снимка рук, нет ставки', () => {
  assert.equal(buildReveal([], players), null);
  assert.equal(buildReveal(undefined, players), null);
  assert.equal(buildReveal([{ type: 'BID_PLACED' }], players), null);
  assert.equal(buildReveal([dudo({ hands: undefined })], players), null);
  assert.equal(buildReveal([dudo({ hands: [] })], players), null);
  assert.equal(buildReveal([dudo({ bid: undefined })], players), null);
});

test('dudo, ставка верна, человек теряет кубик', () => {
  const r = buildReveal([dudo(), { type: 'PLAYER_LOST_DIE', playerId: 'human', newDiceCount: 2 }], players);
  assert.equal(r.kind, 'dudo');
  assert.equal(r.headline, 'Вы: «Не верю!»');
  assert.equal(r.verdict, 'bid_true');
  assert.equal(r.verdictText, 'На столе 4 из 3 — ставка верна');
  assert.equal(r.outcomeText, 'Вы теряете кубик');
  assert.deepEqual(r.bid, { q: 3, f: 5, playerName: 'Иван' });
  assert.deepEqual(r.rows.map((x) => x.name), ['Вы', 'Иван', 'Мария']);
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 3, 0]);
  assert.deepEqual(r.rows[1].hand, [1, 5, 5]);               // отсортированы
  assert.deepEqual(r.rows.map((x) => x.isBidder), [false, true, false]);
  assert.deepEqual(r.rows.map((x) => x.isChallenger), [true, false, false]);
  assert.deepEqual(r.rows.map((x) => x.isLoser), [true, false, false]);
});

test('dudo, ставка ложна, бот выбывает', () => {
  const r = buildReveal([
    dudo({ bidSuccessful: false, actualCount: 2, loserId: 'bot_0', challengerId: 'bot_1' }),
    { type: 'PLAYER_LOST_DIE', playerId: 'bot_0', newDiceCount: 0 },
    { type: 'PLAYER_ELIMINATED', playerId: 'bot_0' },
  ], players);
  assert.equal(r.headline, 'Мария: «Не верю!»');
  assert.equal(r.verdictText, 'На столе 2 из 3 — ставка ложна');
  assert.equal(r.outcomeText, 'Иван выбывает');
  assert.deepEqual(r.eliminatedIds, ['bot_0']);
});

test('человек выбывает: «Вы выбываете»', () => {
  const r = buildReveal([
    dudo(),
    { type: 'PLAYER_LOST_DIE', playerId: 'human', newDiceCount: 0 },
    { type: 'PLAYER_ELIMINATED', playerId: 'human' },
  ], players);
  assert.equal(r.outcomeText, 'Вы выбываете');
});

test('палифико: единицы не считаются совпадением', () => {
  const r = buildReveal([dudo({ wild: false, actualCount: 3 })], players);
  assert.equal(r.wild, false);
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 2, 0]);
});

test('calza точна: получает кубик / уже максимум', () => {
  const calza = (o) => ({
    type: 'DICE_REVEALED', kind: 'calza', bid: { q: 4, f: 5, playerId: 'bot_0' }, actualCount: 4,
    calzaExact: true, wild: true, challengerId: 'human', bidderId: 'bot_0', hands, ...o,
  });
  const a = buildReveal([calza(), { type: 'PLAYER_GAINED_DIE', playerId: 'human', newDiceCount: 4 }], players);
  assert.equal(a.headline, 'Вы: «Calza!»');
  assert.equal(a.verdict, 'calza_exact');
  assert.equal(a.verdictText, 'На столе 4 при ставке 4 — точно!');
  assert.equal(a.outcomeText, 'Вы получаете кубик');
  assert.equal(a.rows.some((r) => r.isLoser), false);
  const b = buildReveal([calza()], players);
  assert.equal(b.outcomeText, 'Кубик не добавлен: уже максимум');
});

test('calza мимо: теряет кубик', () => {
  const r = buildReveal([
    { type: 'DICE_REVEALED', kind: 'calza', bid: { q: 5, f: 5, playerId: 'bot_0' }, actualCount: 4, calzaExact: false,
      wild: true, challengerId: 'bot_1', bidderId: 'bot_0', hands },
    { type: 'PLAYER_LOST_DIE', playerId: 'bot_1', newDiceCount: 2 },
  ], players);
  assert.equal(r.verdict, 'calza_miss');
  assert.equal(r.verdictText, 'На столе 4 при ставке 5 — мимо');
  assert.equal(r.outcomeText, 'Мария теряет кубик');
});

test('интеграция с движком: модель строится из настоящих событий', () => {
  const g = createGame({ botCount: 2, startDice: 3, botNames: ['Иван', 'Мария'] });
  startGame(g);
  g.players[0].hand = [2, 3, 5]; g.players[1].hand = [5, 5, 1]; g.players[2].hand = [4, 6, 2];
  g.currentPlayer = 0;
  g.bid = { playerId: 'bot_0', playerName: 'Иван', q: 3, f: 5 };
  const res = applyAction(g, 'human', { type: 'dudo' });
  const r = buildReveal(res.events, g.players);
  assert.equal(r.verdict, 'bid_true');
  assert.equal(r.actualCount, 4);
  assert.equal(r.outcomeText, 'Вы теряете кубик');
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 3, 0]);
});
