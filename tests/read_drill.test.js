import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_NAMES } from '../src/bots.js';
import { addReadResult, canRead, seatLabel, seatNames, priorHas, pickReadRound, buildReadTask, checkReadAnswers, MAX_QUESTIONS } from '../src/read_drill.js';
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
    const res = checkReadAnswers(round, task, { 1: 80, 3: 20 });
    assert.equal(res.total, 2);
    assert.equal(res.good, 1);
    assert.deepEqual(res.items.map((i) => [i.n, i.truth, i.ok]), [[1, 'has', true], [3, 'has', false]]);
    assert.equal(res.items[1].matches, 3);
  });
  test('джокеры считаются как у вскрытия', () => {
    const r = sanitizeRound({ ...mk(), hands: [[2, 3, 5], [1, 1, 6], [4, 6, 2]], end: { kind: 'dudo', by: 0, bidder: 1, actual: 3, ok: true } });
    const res = checkReadAnswers(r, buildReadTask(r, { rnd: () => 0 }), { 1: 80, 3: 80 });
    assert.equal(res.items[1].matches, 2);
    assert.equal(res.good, 2);
  });
  test('нет цифры в руке: добавляется оговорка «это ещё не блеф»', () => {
    const r = sanitizeRound({ ...mk(), hands: [[2, 3, 5], [6, 6, 3], [6, 6, 2]], end: { kind: 'dudo', by: 0, bidder: 1, actual: 1, ok: false } });
    const res = checkReadAnswers(r, buildReadTask(r, { rnd: () => 0 }), { 1: 20, 3: 20 });
    assert.equal(res.good, 2);
    assert.ok(res.lines.some((l) => /ещё не блеф/.test(l)));
  });
  test('неполные и неверные ответы, чужое задание — null', () => {
    assert.equal(checkReadAnswers(round, task, { 1: 80 }), null);
    assert.equal(checkReadAnswers(round, task, { 1: 80, 3: 'maybe' }), null);
    assert.equal(checkReadAnswers(round, task, null), null);
    assert.equal(checkReadAnswers(round, { ...task, id: 'other' }, { 1: 80, 3: 80 }), null);
    assert.equal(checkReadAnswers(null, task, {}), null);
  });
  test('тексты без запрещённых формулировок', () => {
    const res = checkReadAnswers(round, task, { 1: 80, 3: 20 });
    for (const l of res.lines) for (const re of BANNED) assert.ok(!re.test(l), `${re}: ${l}`);
    assert.ok(!/обманщик|врёт/i.test(res.lines.join(' ')));
  });
});

describe('seatLabel и итог раунда', () => {
  test('«Вы» для вашего места, имена из списка ботов для остальных', () => {
    const r = mk();
    assert.equal(seatLabel(r, 0), 'Вы');
    assert.ok(BOT_NAMES.includes(seatLabel(r, 2)));
    assert.ok(!/^Игрок \d/.test(seatLabel(r, 2)));
  });
  test('имена в одном раунде разные и не меняются при повторном вызове', () => {
    const r = mk();
    const a = seatNames(r);
    assert.deepEqual(a, seatNames(r));
    assert.equal(new Set(a).size, a.length);
    assert.equal(a[r.me], 'Вы');
  });
  test('разные раунды получают разные наборы имён (чаще всего)', () => {
    const sets = new Set();
    for (let i = 0; i < 20; i++) sets.add(seatNames({ ...mk(), id: `r${i}` }).join('|'));
    assert.ok(sets.size > 10);
  });
  test('сохранённые имена берутся из раунда, запасные не повторяют их', () => {
    const r = { ...mk(), names: [null, 'Мария', null] };
    const a = seatNames(r);
    assert.equal(a[1], 'Мария');
    assert.equal(a[0], 'Вы');
    assert.ok(a[2] !== 'Мария' && BOT_NAMES.includes(a[2]));
  });
  test('нестандартный раунд не роняет: без мест — пусто, место вне раунда — запасная подпись', () => {
    assert.deepEqual(seatNames({ id: 'x', me: 0 }), []);
    assert.equal(seatLabel({ id: 'x', me: 0, dice: [1, 1] }, 5), 'Игрок 6');
  });
  test('итог: проверка ставки и Calza', () => {
    const r = mk();
    const t = buildReadTask(r, { rnd: () => 0 });
    const ans = { 1: 80, 3: 80 };
    assert.equal(checkReadAnswers(r, t, ans).outcome, 'Проверка ставки 3×5: на столе 4, ставка верна.');
    const c = sanitizeRound({ ...r, bids: [{ s: 2, q: 1, f: 4 }, { s: 0, q: 2, f: 4 }, { s: 1, q: 4, f: 5 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 4, ok: true } });
    assert.equal(checkReadAnswers(c, buildReadTask(c, { rnd: () => 0 }), ans).outcome, 'Calza на 4×5: на столе 4, точно.');
    const m = sanitizeRound({ ...c, end: { kind: 'calza', by: 0, bidder: 1, actual: 4, ok: false }, bids: [{ s: 2, q: 1, f: 4 }, { s: 0, q: 2, f: 4 }, { s: 1, q: 3, f: 5 }] });
    assert.equal(checkReadAnswers(m, buildReadTask(m, { rnd: () => 0 }), ans).outcome, 'Calza на 3×5: на столе 4, мимо.');
  });
});

describe('addReadResult', () => {
  test('добавляет ответы к теме read, остальные темы не трогает и не меняет исходный объект', () => {
    const src = { dudo: { n: 5, good: 3 } };
    const out = addReadResult(src, { good: 2, total: 3 });
    assert.deepEqual(out, { dudo: { n: 5, good: 3 }, read: { n: 3, good: 2 } });
    assert.deepEqual(src, { dudo: { n: 5, good: 3 } });
    assert.deepEqual(addReadResult(out, { good: 1, total: 3 }).read, { n: 6, good: 3 });
  });
  test('мусор: пустой результат и испорченные счётчики', () => {
    assert.deepEqual(addReadResult(null, { good: 1, total: 0 }), {});
    assert.deepEqual(addReadResult([], null), {});
    assert.deepEqual(addReadResult({ read: { n: 'x' } }, { good: 1, total: 2 }).read, { n: 2, good: 1 });
    assert.deepEqual(addReadResult({}, { good: 9, total: 2 }).read, { n: 2, good: 2 });
    assert.deepEqual(addReadResult({}, { good: -4, total: 2 }).read, { n: 2, good: 0 });
  });
});
