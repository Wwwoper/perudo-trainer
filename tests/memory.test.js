// Память ботов об игроке: подсчёт, сглаживание, защита от испорченных данных.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemory, normalizeMemory, recordChallenge, bluffRate, opponentModel,
  observeEvent, describeMemory, PRIOR_RATE, MAX_SAMPLES,
} from '../src/memory.js';
import { createGame, startGame, applyAction } from '../src/engine.js';

test('пустая память: доля блефа равна предположению по умолчанию', () => {
  assert.equal(bluffRate(createMemory()), PRIOR_RATE);
  assert.deepEqual(opponentModel(createMemory()), { bluffRate: PRIOR_RATE, samples: 0 });
});

test('recordChallenge считает проверенные и ложные ставки и не мутирует вход', () => {
  const m0 = createMemory();
  const m1 = recordChallenge(m0, true);
  const m2 = recordChallenge(m1, false);
  assert.deepEqual(m0, createMemory());
  assert.equal(m1.challenged, 1); assert.equal(m1.bluffs, 1);
  assert.equal(m2.challenged, 2); assert.equal(m2.bluffs, 1);
});

test('доля блефа растёт у блефующего, падает у честного, всегда между 0 и 1', () => {
  let liar = createMemory(); let honest = createMemory();
  for (let i = 0; i < 30; i++) { liar = recordChallenge(liar, true); honest = recordChallenge(honest, false); }
  assert.ok(bluffRate(liar) > 0.8 && bluffRate(liar) < 1);
  assert.ok(bluffRate(honest) < 0.1 && bluffRate(honest) > 0);
});

test('одно наблюдение почти не меняет мнение (сглаживание)', () => {
  const r = bluffRate(recordChallenge(createMemory(), true));
  assert.ok(r > PRIOR_RATE && r < 0.5, `r=${r}`);
});

test('старые наблюдения «выцветают»: счётчик не растёт бесконечно', () => {
  let m = createMemory();
  for (let i = 0; i < MAX_SAMPLES * 3; i++) m = recordChallenge(m, i % 2 === 0);
  assert.ok(m.challenged <= MAX_SAMPLES);
  assert.ok(m.bluffs <= m.challenged);
  assert.ok(Math.abs(bluffRate(m) - 0.5) < 0.1);
});

test('normalizeMemory: мусор из хранилища заменяется пустой памятью', () => {
  const bad = [null, undefined, 5, 'x', [], {}, { challenged: -1, bluffs: 0 }, { challenged: 3, bluffs: 9 },
    { challenged: NaN, bluffs: 1 }, { challenged: 'a', bluffs: 'b' }, { challenged: Infinity, bluffs: 0 }];
  for (const raw of bad) assert.deepEqual(normalizeMemory(raw), createMemory(), JSON.stringify(raw));
  assert.deepEqual(normalizeMemory({ challenged: 4.9, bluffs: 2 }), { v: 1, challenged: 4, bluffs: 2 });
  // нормальные данные сохраняются
  assert.deepEqual(normalizeMemory({ v: 1, challenged: 7, bluffs: 3 }), { v: 1, challenged: 7, bluffs: 3 });
});

test('observeEvent учитывает только проверку «Не верю» ставки человека', () => {
  const m = createMemory();
  const dudoOnHuman = { type: 'DICE_REVEALED', kind: 'dudo', bidderId: 'human', bidSuccessful: false };
  assert.deepEqual(observeEvent(m, dudoOnHuman, 'human'), { v: 1, challenged: 1, bluffs: 1 });
  assert.deepEqual(observeEvent(m, { ...dudoOnHuman, bidSuccessful: true }, 'human'), { v: 1, challenged: 1, bluffs: 0 });
  assert.equal(observeEvent(m, { ...dudoOnHuman, bidderId: 'bot_0' }, 'human'), m, 'ставка бота');
  assert.equal(observeEvent(m, { ...dudoOnHuman, kind: 'calza' }, 'human'), m, 'Calza не про блеф');
  assert.equal(observeEvent(m, { type: 'BID_PLACED' }, 'human'), m);
  assert.equal(observeEvent(m, null, 'human'), m);
});

test('describeMemory: пока мало данных — так и пишет, потом показывает процент', () => {
  assert.match(describeMemory(createMemory()), /присматриваются/);
  let m = createMemory();
  for (let i = 0; i < 10; i++) m = recordChallenge(m, i < 4);
  assert.match(describeMemory(m), /Проверено ваших ставок: 10/);
  assert.match(describeMemory(m), /%/);
});

test('интеграция с движком: память строится из настоящих событий', () => {
  const g = createGame({ botCount: 1, startDice: 2 });
  startGame(g);
  g.players[0].hand = [2, 3]; g.players[1].hand = [4, 4];
  g.currentPlayer = 1;
  g.bid = { playerId: 'human', playerName: 'Вы', q: 4, f: 6 };       // заведомо ложная ставка человека
  const res = applyAction(g, 'bot_0', { type: 'dudo' });
  let m = createMemory();
  for (const e of res.events) m = observeEvent(m, e, 'human');
  assert.deepEqual(m, { v: 1, challenged: 1, bluffs: 1 });
});
