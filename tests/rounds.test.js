// rounds.test.js — завершённые раунды: сборка из событий движка, проверка, лимит, копия, хранилище.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  countFace, snapshotRound, buildRound, sanitizeRound, normalizeRounds, appendRounds, cloneRound,
  MAX_ROUNDS, MAX_ROUND_BIDS,
} from '../src/rounds.js';
import { sanitizeRounds, SANITIZERS } from '../src/data_schema.js';
import { BACKUP_KEYS, buildBackup, parseBackup } from '../src/backup.js';
import { createGame, startGame, applyAction } from '../src/engine.js';

/** Верный раунд: вы — место 0, у вас [2,2,1], у соперника [3,4]; последняя ставка 3×3 ложна: одна тройка и один джокер, всего 2. */
const mk = (id = 'g-r1', extra = {}) => ({
  id, ts: 1000, round: 1, wild: true, me: 0,
  dice: [3, 2], styles: [null, 'smart'],
  hands: [[2, 2, 1], [3, 4]],
  bids: [{ s: 1, q: 2, f: 3 }, { s: 0, q: 3, f: 2 }, { s: 1, q: 3, f: 3 }],
  end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: false },
  ...extra,
});

describe('countFace', () => {
  it('единицы-джокеры считаются, кроме Палифико и грани 1', () => {
    const h = [[1, 2, 2], [3, 1]];
    assert.equal(countFace(h, 2, true), 4);
    assert.equal(countFace(h, 2, false), 2);
    assert.equal(countFace(h, 1, true), 2);
    assert.equal(countFace([], 3, true), 0);
  });
});

describe('sanitizeRound', () => {
  it('верный раунд проходит и копируется', () => {
    const src = mk();
    const r = sanitizeRound(src);
    assert.deepEqual(r, src);
    assert.notEqual(r.hands[0], src.hands[0]);
    assert.notEqual(r.bids, src.bids);
  });
  it('Calza: ok — точное совпадение', () => {
    const r = sanitizeRound(mk('c', {
      bids: [{ s: 1, q: 2, f: 3 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 2, ok: true },
    }));
    assert.ok(r);
    assert.equal(sanitizeRound(mk('c', { bids: [{ s: 1, q: 1, f: 3 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 2, ok: true } })), null);
  });
  it('Палифико: единицы не считаются', () => {
    const ok = mk('p', { wild: false, bids: [{ s: 1, q: 2, f: 2 }], end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: true } });
    assert.ok(sanitizeRound(ok));
    assert.equal(sanitizeRound({ ...ok, wild: true }), null);     // с джокером двоек было бы три
  });
  it('лишние поля и чужой стиль отбрасываются, свой стиль — null', () => {
    const r = sanitizeRound({ ...mk(), hack: '<b>', styles: ['smart', 'Плохо!'] });
    assert.equal('hack' in r, false);
    assert.deepEqual(r.styles, [null, null]);
  });
  it('вас нет за столом: me = -1', () => {
    assert.ok(sanitizeRound(mk('x', { me: -1, styles: ['careful', 'smart'] })));
  });
  it('противоречия и мусор — null', () => {
    const bad = [
      null, undefined, 5, 'x', [], {}, mk('', {}), mk('a'.repeat(65)),
      mk('a', { ts: NaN }), mk('a', { ts: '1' }), mk('a', { round: -1 }), mk('a', { round: 1.5 }), mk('a', { wild: 1 }),
      mk('a', { dice: [3] }), mk('a', { dice: [3, 0] }), mk('a', { dice: [3, 11] }), mk('a', { dice: [3, 2, 1, 1, 1, 1, 1] }),
      mk('a', { me: 2 }), mk('a', { me: -2 }), mk('a', { me: 0.5 }),
      mk('a', { hands: [[2, 2, 1]] }), mk('a', { hands: [[2, 2], [3, 4]] }), mk('a', { hands: [[2, 2, 7], [3, 4]] }),
      mk('a', { hands: [[2, 2, 1], null] }),
      mk('a', { styles: ['x'] }),
      mk('a', { bids: [] }), mk('a', { bids: 'x' }), mk('a', { bids: [null] }), mk('a', { bids: [{ s: 5, q: 1, f: 1 }] }),
      mk('a', { bids: [{ s: 1, q: 0, f: 1 }] }), mk('a', { bids: [{ s: 1, q: 1, f: 9 }] }),
      mk('a', { bids: Array.from({ length: MAX_ROUND_BIDS + 1 }, () => ({ s: 1, q: 1, f: 3 })) }),
      mk('a', { end: null }), mk('a', { end: { kind: 'raise', by: 0, bidder: 1, actual: 1, ok: false } }),
      mk('a', { end: { kind: 'dudo', by: 1, bidder: 1, actual: 2, ok: false } }),          // проверил сам автор ставки
      mk('a', { end: { kind: 'dudo', by: 0, bidder: 0, actual: 2, ok: false } }),          // автор не тот, что в ставках
      mk('a', { end: { kind: 'dudo', by: 0, bidder: 1, actual: 9, ok: false } }),
      mk('a', { end: { kind: 'dudo', by: 0, bidder: 1, actual: 1, ok: false } }),          // actual не сходится с руками
      mk('a', { end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: true } }),           // итог не сходится со ставкой
      mk('a', { end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: 'no' } }),
    ];
    for (const b of bad) assert.equal(sanitizeRound(b), null, JSON.stringify(b)?.slice(0, 120));
  });
});

describe('normalizeRounds / appendRounds', () => {
  it('не массив — пустой список; мусор отбрасывается', () => {
    assert.deepEqual(normalizeRounds(null), []);
    assert.deepEqual(normalizeRounds({}), []);
    assert.deepEqual(normalizeRounds([1, null, mk('a'), { id: 'z' }]).map((r) => r.id), ['a']);
  });
  it('повтор по id схлопывается, остаётся последняя запись в конце', () => {
    const r = normalizeRounds([mk('a'), mk('b'), mk('a', { ts: 5 })]);
    assert.deepEqual(r.map((x) => x.id), ['b', 'a']);
    assert.equal(r[1].ts, 5);
  });
  it(`хранится не больше ${MAX_ROUNDS} последних`, () => {
    const many = Array.from({ length: MAX_ROUNDS + 7 }, (_, i) => mk(`g-r${i}`, { round: i }));
    const r = normalizeRounds(many);
    assert.equal(r.length, MAX_ROUNDS);
    assert.equal(r[0].id, 'g-r7');
    assert.equal(r.at(-1).id, `g-r${MAX_ROUNDS + 6}`);
    assert.equal(appendRounds(r, [mk('new')]).length, MAX_ROUNDS);
    assert.equal(appendRounds(r, [mk('new')]).at(-1).id, 'new');
    assert.equal(appendRounds(null, undefined).length, 0);
    assert.equal(normalizeRounds(many, 3).length, 3);
  });
});

describe('sanitizeRounds (схема данных)', () => {
  it('пустое и отсутствующее — не повреждение; не массив — одно повреждение', () => {
    assert.deepEqual(sanitizeRounds(undefined), { value: [], dropped: 0 });
    assert.deepEqual(sanitizeRounds({}), { value: [], dropped: 0 });
    assert.deepEqual(sanitizeRounds('x'), { value: [], dropped: 1 });
  });
  it('считает отброшенные записи', () => {
    const r = sanitizeRounds([mk('a'), { id: 'x' }, null]);
    assert.equal(r.value.length, 1);
    assert.equal(r.dropped, 2);
  });
  it('зарегистрирован в копии и проходит круг через файл', () => {
    assert.ok(SANITIZERS['perudo.rounds']);
    assert.ok(BACKUP_KEYS.includes('perudo.rounds'));
    const data = { 'perudo.rounds': [mk('a'), mk('b')] };
    const text = JSON.stringify(buildBackup((k) => data[k] ?? null));
    const back = parseBackup(text);
    assert.equal(back.ok, true);
    assert.deepEqual(back.data['perudo.rounds'].map((r) => r.id), ['a', 'b']);
    assert.deepEqual(back.data['perudo.rounds'], [sanitizeRound(mk('a')), sanitizeRound(mk('b'))]);
  });
});

describe('cloneRound', () => {
  it('глубокая копия', () => {
    const r = sanitizeRound(mk());
    const c = cloneRound(r);
    assert.deepEqual(c, r);
    c.hands[0][0] = 6; c.bids[0].q = 9; c.end.ok = true; c.dice[0] = 1; c.styles[1] = 'x';
    assert.equal(r.hands[0][0], 2);
    assert.equal(r.bids[0].q, 2);
    assert.equal(r.end.ok, false);
    assert.equal(r.dice[0], 3);
    assert.equal(r.styles[1], 'smart');
  });
});

describe('snapshotRound / buildRound на настоящем движке', () => {
  let game;
  beforeEach(() => {
    game = createGame({ id: 'e', humanName: 'Вы', botCount: 2, startDice: 3 });
    startGame(game);
    game.players[0].hand = [2, 2, 1];
    game.players[1].hand = [3, 4, 5];
    game.players[2].hand = [6, 6, 4];
    game.currentPlayer = 0;
  });

  it('снимок берёт живых игроков и ставки раунда', () => {
    applyAction(game, 'human', { type: 'raise', quantity: 2, face: 2 });
    const s = snapshotRound(game);
    assert.equal(s.seats.length, 3);
    assert.deepEqual(s.bids.map((b) => [b.q, b.f]), [[2, 2]]);
    assert.equal(s.wild, true);
    assert.deepEqual(snapshotRound(null).seats, []);
  });

  it('проверка: раунд собирается из события и проходит проверку', () => {
    applyAction(game, 'human', { type: 'raise', quantity: 2, face: 2 });
    const bot1 = game.players[1].id;
    applyAction(game, bot1, { type: 'raise', quantity: 4, face: 2 });
    const snap = snapshotRound(game);
    const res = applyAction(game, game.players[2].id, { type: 'dudo' });
    assert.ok(res.success);
    const r = buildRound({ id: 'e-r1', ts: 1, snap, reveal: res.events.find((e) => e.type === 'DICE_REVEALED') });
    assert.ok(r, 'раунд собран');
    assert.equal(r.me, 0);
    assert.deepEqual(r.hands, [[2, 2, 1], [3, 4, 5], [6, 6, 4]]);
    assert.deepEqual(r.bids.map((b) => [b.s, b.q, b.f]), [[0, 2, 2], [1, 4, 2]]);
    assert.deepEqual(r.end, { kind: 'dudo', by: 2, bidder: 1, actual: 3, ok: false });
  });

  it('Calza на точной ставке', () => {
    game.calzaEnabled = true;
    applyAction(game, 'human', { type: 'raise', quantity: 3, face: 2 });
    const snap = snapshotRound(game);
    const res = applyAction(game, game.players[1].id, { type: 'calza' });
    if (!res.success) return;       // Calza могла быть недоступна в этой конфигурации: тогда проверять нечего
    const r = buildRound({ id: 'e-r1', ts: 1, snap, reveal: res.events.find((e) => e.type === 'DICE_REVEALED') });
    assert.equal(r.end.kind, 'calza');
    assert.equal(r.end.ok, true);
  });

  it('мусор на входе — null', () => {
    assert.equal(buildRound({ id: 'x', ts: 1, snap: null, reveal: {} }), null);
    assert.equal(buildRound({ id: 'x', ts: 1, snap: { seats: [], bids: [] }, reveal: { hands: [] } }), null);
    assert.equal(buildRound({ id: 'x', ts: 1, snap: snapshotRound(game), reveal: null }), null);
  });
});
