import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLastTrue, gradeQuestion, faceGlyph, KIND_LAST_TRUE } from '../src/table_quiz.js';
import { simulateRound } from '../src/read_sim.js';

const round = (over = {}, endOver = {}) => ({
  id: 'x1', ts: 0, round: 1, wild: true, me: 0,
  dice: [2, 2, 2], styles: [null, 'smart', 'smart'],
  hands: [[3, 4], [4, 1], [2, 6]],
  bids: [{ s: 1, q: 2, f: 4 }, { s: 2, q: 3, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 2, actual: 3, ok: true, ...endOver },
  ...over,
});

test('faceGlyph: грань превращается в символ кубика', () => {
  assert.equal(faceGlyph(4), '⚃');
  assert.equal(faceGlyph(6), '⚅');
});

test('buildLastTrue: верная ставка → ответ «yes», пояснение с числами', () => {
  const q = buildLastTrue(round());
  assert.equal(q.kind, KIND_LAST_TRUE);
  assert.equal(q.input, 'two');
  assert.equal(q.answer, 'yes');
  assert.deepEqual(q.options.map((o) => o.v), ['yes', 'no']);
  assert.match(q.title, /3 × ⚃/);
  assert.match(q.explain, /3 × ⚃.*джокер.*3.*хватило/);
});

test('buildLastTrue: неверная ставка → «no»', () => {
  const q = buildLastTrue(round({}, { actual: 2, ok: false }));
  assert.equal(q.answer, 'no');
  assert.match(q.explain, /не хватило/);
});

test('buildLastTrue: без джокеров (Палифико) про джокеры не пишем', () => {
  const q = buildLastTrue(round({ wild: false }));
  assert.doesNotMatch(q.explain, /джокер/);
});

test('buildLastTrue: не годятся Calza, своя последняя ставка и пустой раунд', () => {
  assert.equal(buildLastTrue(round({}, { kind: 'calza' })), null);
  assert.equal(buildLastTrue(round({ bids: [{ s: 1, q: 2, f: 4 }, { s: 0, q: 3, f: 4 }] })), null);
  assert.equal(buildLastTrue(round({ bids: [] })), null);
  assert.equal(buildLastTrue(null), null);
});

test('gradeQuestion: совпадение с ответом даёт балл', () => {
  const q = buildLastTrue(round());
  assert.deepEqual(gradeQuestion(q, 'yes'), { ok: true, points: 1, max: 1 });
  assert.deepEqual(gradeQuestion(q, 'no'), { ok: false, points: 0, max: 1 });
  assert.deepEqual(gradeQuestion(null, 'yes'), { ok: false, points: 0, max: 1 });
});

test('баланс: на учебных столах самый частый ответ не больше 55 %', () => {
  const count = { yes: 0, no: 0 };
  for (let seed = 1; seed <= 4000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildLastTrue(r);
    if (q) count[q.answer]++;
  }
  const n = count.yes + count.no;
  assert.ok(n >= 1500, `мало вопросов: ${n}`);
  assert.ok(Math.max(count.yes, count.no) / n <= 0.55, JSON.stringify(count));
});
