import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canRead, priorHas, pickReadRound, buildReadTask, checkReadAnswers, MAX_QUESTIONS } from '../src/read_drill.js';
import { sanitizeRound } from '../src/rounds.js';
import { BANNED } from '../src/situation_text.js';

// Вы — место 0 (рука [2,3,5]), место 1 — [5,5,1], место 2 — [4,6,2]; единицы — джокеры.
const mk = (over = {}) => sanitizeRound({
  id: 'r1', ts: 1, round: 3, wild: true, me: 0,
  dice: [3, 3, 3], styles: [null, null, null],
  hands: [[2, 3, 5], [5, 5, 1], [4, 6, 2]],
  bids: [{ s: 2, q: 1, f: 4 }, { s: 0, q: 2, f: 4 }, { s: 1, q: 3, f: 5 }],
  end: { kind: 'dudo', by: 0, bidder: 1, actual: 4, ok: true },
  ...over,
});
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('canRead', () => {
  test('нужна ваша позиция и чужая ставка', () => {
    assert.equal(canRead(mk()), true);
    assert.equal(canRead(null), false);
    assert.equal(canRead({ me: -1, bids: [{ s: 1 }] }), false);
    assert.equal(canRead({ me: 0, bids: [{ s: 0 }] }), false);
  });
});

describe('priorHas', () => {
  test('шанс хотя бы одного кубика нужной грани', () => {
    assert.ok(Math.abs(priorHas(1, 5, true) - 1 / 3) < 1e-9);
    assert.ok(Math.abs(priorHas(1, 5, false) - 1 / 6) < 1e-9);
    assert.ok(Math.abs(priorHas(1, 1, true) - 1 / 6) < 1e-9);
    assert.ok(Math.abs(priorHas(2, 5, true) - (1 - (2 / 3) ** 2)) < 1e-9);
    assert.equal(priorHas(0, 5, true), 0);
  });
});

describe('pickReadRound', () => {
  const a = mk({ id: 'a' }); const b = mk({ id: 'b' });
  const bad = mk({ id: 'c', me: -1 });
  test('мусор и подходящие', () => {
    assert.equal(pickReadRound([], new Set()), null);
    assert.equal(pickReadRound(null), null);
    assert.equal(pickReadRound([bad]), null);
  });
  test('сначала ещё не показанные', () => {
    for (const r of [0, 0.4, 0.99]) assert.equal(pickReadRound([a, b], new Set(['a']), () => r).id, 'b');
  });
  test('все показаны — берётся любой подходящий', () => {
    assert.equal(pickReadRound([a, b], new Set(['a', 'b']), () => 0).id, 'a');
    assert.equal(pickReadRound([a, b], new Set(['a', 'b']), () => 0.99).id, 'b');
  });
});

describe('buildReadTask', () => {
  test('вопросы по чужим ставкам, ваши не спрашиваются', () => {
    const t = buildReadTask(mk(), { rnd: () => 0 });
    assert.deepEqual(t.questions.map((q) => q.n), [1, 3]);
    assert.deepEqual(t.hand, [2, 3, 5]);
    assert.equal(t.bids.length, 3);
    assert.equal(t.bids[1].isMe, true);
  });
  test('задание не содержит чужих рук и итога раунда', () => {
    const t = buildReadTask(mk(), { rnd: () => 0 });
    const s = JSON.stringify(t);
    assert.ok(!('hands' in t) && !('end' in t));
    assert.ok(!s.includes('"actual"') && !s.includes('"ok"'));
  });
  test('повтор «автор + цифра» не спрашивается дважды', () => {
    const r = mk({ bids: [{ s: 1, q: 1, f: 5 }, { s: 2, q: 2, f: 5 }, { s: 1, q: 3, f: 5 }], end: { kind: 'dudo', by: 0, bidder: 1, actual: 4, ok: true } });
    const t = buildReadTask(r, { rnd: () => 0 });
    assert.deepEqual(t.questions.map((q) => `${q.seat}:${q.f}`), ['1:5', '2:5']);
  });
  test('не больше MAX_QUESTIONS, порядок по ставкам', () => {
    const faces = [2, 3, 4, 2, 3, 5];
    const bids = faces.map((f, i) => ({ s: 1 + (i % 2), q: i + 1, f }));
    const r2 = sanitizeRound({
      id: 'r6', ts: 1, round: 1, wild: true, me: 0, dice: [3, 3, 3], styles: [null, null, null],
      hands: [[2, 3, 4], [4, 4, 2], [3, 3, 4]], bids,
      end: { kind: 'dudo', by: 0, bidder: bids[5].s, actual: 0, ok: false },
    });
    assert.ok(r2, 'раунд для проверки собран');
    const t = buildReadTask(r2, { rnd: seq(0.9, 0.1, 0.5, 0.3) });
    assert.equal(t.questions.length, MAX_QUESTIONS);
    const ns = t.questions.map((q) => q.n);
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b));
  });
  test('нет подходящего раунда — null', () => {
    assert.equal(buildReadTask(mk({ me: -1 })), null);
    assert.equal(buildReadTask(null), null);
  });
  test('вопрос несёт размер руки и априорный шанс', () => {
    const q = buildReadTask(mk(), { rnd: () => 0 }).questions[0];
    assert.equal(q.size, 3);
    assert.ok(Math.abs(q.prior - priorHas(3, 4, true)) < 1e-9);
  });
});

describe('checkReadAnswers', () => {
  const round = mk();
  const task = buildReadTask(round, { rnd: () => 0 });
  test('верные и неверные ответы по рукам', () => {
    // ставка 1: место 2, цифра 4 — в руке [4,6,2] есть 4 → has; ставка 3: место 1, цифра 5 — [5,5,1] есть → has
    const res = checkReadAnswers(round, task, { 1: 'has', 3: 'none' });
    assert.equal(res.total, 2);
    assert.equal(res.good, 1);
    assert.deepEqual(res.items.map((i) => [i.n, i.truth, i.ok]), [[1, 'has', true], [3, 'has', false]]);
    assert.equal(res.items[1].matches, 3);
  });
  test('джокеры считаются как у вскрытия', () => {
    const r = sanitizeRound({ ...mk(), hands: [[2, 3, 5], [1, 1, 6], [4, 6, 2]], end: { kind: 'dudo', by: 0, bidder: 1, actual: 3, ok: true } });
    const res = checkReadAnswers(r, buildReadTask(r, { rnd: () => 0 }), { 1: 'has', 3: 'has' });
    assert.equal(res.items[1].matches, 2);
    assert.equal(res.good, 2);
  });
  test('нет цифры в руке: добавляется оговорка «это ещё не блеф»', () => {
    const r = sanitizeRound({ ...mk(), hands: [[2, 3, 5], [6, 6, 3], [6, 6, 2]], end: { kind: 'dudo', by: 0, bidder: 1, actual: 1, ok: false } });
    const res = checkReadAnswers(r, buildReadTask(r, { rnd: () => 0 }), { 1: 'none', 3: 'none' });
    assert.equal(res.good, 2);
    assert.ok(res.lines.some((l) => /ещё не блеф/.test(l)));
  });
  test('неполные и неверные ответы, чужое задание — null', () => {
    assert.equal(checkReadAnswers(round, task, { 1: 'has' }), null);
    assert.equal(checkReadAnswers(round, task, { 1: 'has', 3: 'maybe' }), null);
    assert.equal(checkReadAnswers(round, task, null), null);
    assert.equal(checkReadAnswers(round, { ...task, id: 'other' }, { 1: 'has', 3: 'has' }), null);
    assert.equal(checkReadAnswers(null, task, {}), null);
  });
  test('тексты без запрещённых формулировок', () => {
    const res = checkReadAnswers(round, task, { 1: 'has', 3: 'none' });
    for (const l of res.lines) for (const re of BANNED) assert.ok(!re.test(l), `${re}: ${l}`);
    assert.ok(!/обманщик|врёт/i.test(res.lines.join(' ')));
  });
});
