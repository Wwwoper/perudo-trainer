// moment_ctx.test.js — контекст стола в записи момента: сборка, проверка, копирование, круговой обмен.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCtx, sanitizeCtx, buildMoment, sanitizeMoment, normalizeMoments, cloneMoment, CTX_MAX_BIDS,
} from '../src/moments.js';
import { sanitizeReviews } from '../src/data_schema.js';
import { createGame, startGame, applyAction, getPublicState } from '../src/engine.js';

const players = [
  { id: 'human', dice: 3, alive: true },
  { id: 'bot1', dice: 2, alive: true, style: 'smart' },
  { id: 'bot2', dice: 0, alive: false, style: 'careful' },
  { id: 'bot3', dice: 4, alive: true, style: 'bluffer' },
];
const hist = [
  { playerId: 'bot3', q: 2, f: 4 },
  { playerId: 'bot1', q: 3, f: 4 },
];

describe('buildCtx', () => {
  it('места считаются среди живых, выбывшие не попадают', () => {
    const c = buildCtx({ players, bidHistory: hist, meId: 'human' });
    assert.deepEqual(c, {
      me: 0, dice: [3, 2, 4], styles: [null, 'smart', 'bluffer'],
      bids: [{ s: 2, q: 2, f: 4 }, { s: 1, q: 3, f: 4 }],
    });
  });
  it('своё место не в начале списка', () => {
    const c = buildCtx({ players: [players[1], players[0], players[3]], bidHistory: [], meId: 'human' });
    assert.equal(c.me, 1);
    assert.deepEqual(c.styles, ['smart', null, 'bluffer']);
  });
  it('нет вас среди живых или мусор на входе — null', () => {
    assert.equal(buildCtx({ players, bidHistory: [], meId: 'nobody' }), null);
    assert.equal(buildCtx({ players: null, bidHistory: [], meId: 'human' }), null);
    assert.equal(buildCtx({ players: [players[0]], bidHistory: [], meId: 'human' }), null); // один игрок — не стол
  });
  it('ставки неизвестных игроков и мусор пропускаются, хранятся последние CTX_MAX_BIDS', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ playerId: i % 2 ? 'bot1' : 'bot3', q: i + 1, f: 2 }));
    const c = buildCtx({ players, bidHistory: [null, { playerId: 'ghost', q: 1, f: 1 }, ...many], meId: 'human' });
    assert.equal(c.bids.length, CTX_MAX_BIDS);
    assert.equal(c.bids.at(-1).q, 20);
    assert.equal(c.bids[0].q, 9);
  });
  it('стиль неизвестного вида отбрасывается', () => {
    const c = buildCtx({ players: [players[0], { id: 'b', dice: 2, alive: true, style: 'Плохой стиль!' }], bidHistory: [], meId: 'human' });
    assert.deepEqual(c.styles, [null, null]);
  });
});

describe('sanitizeCtx', () => {
  const ok = () => ({ me: 0, dice: [3, 2, 4], styles: [null, 'smart', 'bluffer'], bids: [{ s: 1, q: 3, f: 4 }] });
  it('верный контекст проходит и копируется', () => {
    const src = ok();
    const c = sanitizeCtx(src, { n: 9, myDice: 3 });
    assert.deepEqual(c, src);
    c.dice[0] = 99;
    assert.equal(src.dice[0], 3);
  });
  it('свой стиль всегда null', () => {
    const c = sanitizeCtx({ ...ok(), styles: ['smart', 'smart', null] });
    assert.equal(c.styles[0], null);
  });
  it('несогласованное с моментом отбрасывается', () => {
    assert.equal(sanitizeCtx(ok(), { n: 10, myDice: 3 }), null);
    assert.equal(sanitizeCtx(ok(), { n: 9, myDice: 2 }), null);
  });
  it('мусор — null', () => {
    const bad = [
      null, undefined, 5, 'x', [], {},
      { ...ok(), dice: [3] }, { ...ok(), dice: [3, 2, 4, 1, 1, 1, 1] }, { ...ok(), dice: [3, 0, 4] },
      { ...ok(), dice: [3, 2.5, 4] }, { ...ok(), me: 3 }, { ...ok(), me: -1 }, { ...ok(), me: 0.5 },
      { ...ok(), styles: [null] }, { ...ok(), styles: 'x' }, { ...ok(), bids: 'x' },
      { ...ok(), bids: [{ s: 5, q: 1, f: 1 }] }, { ...ok(), bids: [{ s: 0, q: 0, f: 1 }] },
      { ...ok(), bids: [{ s: 0, q: 1, f: 7 }] }, { ...ok(), bids: [null] },
    ];
    for (const b of bad) assert.equal(sanitizeCtx(b), null, JSON.stringify(b));
  });
});

describe('момент с контекстом', () => {
  const base = { id: 'g-1', ts: 5, round: 2, kind: 'dudo', total: 9, hand: [1, 2, 3], bid: { q: 3, f: 4 }, p: 0.5, code: 'meh' };
  it('контекст сохраняется в момент', () => {
    const ctx = buildCtx({ players, bidHistory: hist, meId: 'human' });
    const m = buildMoment({ ...base, ctx });
    assert.deepEqual(m.ctx, ctx);
  });
  it('без контекста (старые записи) — ctx: null, момент остаётся', () => {
    const m = buildMoment(base);
    assert.equal(m.ctx, null);
    assert.ok(sanitizeMoment({ ...m, ctx: undefined }));
  });
  it('испорченный контекст не губит момент', () => {
    const m = buildMoment({ ...base, ctx: { me: 9 } });
    assert.ok(m);
    assert.equal(m.ctx, null);
  });
  it('контекст, не сходящийся с числом кубиков момента, отбрасывается', () => {
    const ctx = buildCtx({ players, bidHistory: hist, meId: 'human' });
    assert.equal(buildMoment({ ...base, total: 12, ctx }).ctx, null);
  });
  it('круговой обмен через JSON и normalizeMoments / sanitizeReviews', () => {
    const ctx = buildCtx({ players, bidHistory: hist, meId: 'human' });
    const m = buildMoment({ ...base, ctx });
    const back = JSON.parse(JSON.stringify([m]));
    assert.deepEqual(normalizeMoments(back), [m]);
    assert.deepEqual(sanitizeReviews(back).value, [m]);
  });
  it('cloneMoment делает глубокую копию', () => {
    const m = buildMoment({ ...base, ctx: buildCtx({ players, bidHistory: hist, meId: 'human' }) });
    const c = cloneMoment(m);
    assert.deepEqual(c, m);
    c.ctx.bids[0].q = 99; c.ctx.dice[0] = 99; c.ctx.styles[1] = 'x'; c.h[0] = 6; c.tags.push('x');
    assert.equal(m.ctx.bids[0].q, 2);
    assert.equal(m.ctx.dice[0], 3);
    assert.equal(m.ctx.styles[1], 'smart');
    assert.equal(cloneMoment({ ...m, ctx: null }).ctx, null);
  });
});

describe('контекст из настоящей партии', () => {
  it('ставки раунда и кубики совпадают с состоянием движка', () => {
    const game = createGame({ id: 'c', humanName: 'Вы', botCount: 3, startDice: 5 });
    startGame(game);
    const me = game.players[0];
    // ходим по очереди, пока не наступит ваш ход с хотя бы одной ставкой
    let guard = 0;
    while (guard++ < 50 && !(game.currentPlayer === 0 && game.bid)) {
      const cur = game.players[game.currentPlayer];
      const q = (game.bid?.q ?? 0) + 1;
      const r = applyAction(game, cur.id, { type: 'raise', quantity: q, face: 2 });
      if (!r.success) break;
    }
    assert.ok(game.bid && game.currentPlayer === 0);
    const c = buildCtx({ players: getPublicState(game).players, bidHistory: game.bidHistory, meId: me.id });
    assert.equal(c.me, 0);
    assert.equal(c.dice.length, 4);
    assert.equal(c.dice.reduce((a, b) => a + b, 0), 20);
    assert.equal(c.bids.length, game.bidHistory.length);
    assert.equal(c.bids.at(-1).q, game.bid.q);
    assert.equal(c.styles[0], null);
  });
});
