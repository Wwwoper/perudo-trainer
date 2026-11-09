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

// ───── «Какая ставка самая слабая?» ─────
import { buildWeakestBid, KIND_WEAKEST_BID, WEAK_CHOICES } from '../src/table_quiz.js';

const weakRound = (over = {}) => ({
  id: 'w1', ts: 0, round: 1, wild: true, me: 0,
  dice: [2, 2, 2, 2], styles: [null, 'smart', 'smart', 'smart'],
  hands: [[3, 3], [5, 5], [6, 2], [4, 1]],
  bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }, { s: 3, q: 3, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 3, actual: 1, ok: false },
  ...over,
});
const mid = () => 0.3;

test('buildWeakestBid: слабая ставка — где у автора меньше всего нужных кубиков', () => {
  // Ирина: 2 из 2 (⚄⚄), Алексей: 1 из 2 (⚅), Юлия: 2 из 2 (⚃ и джокер) → ровно одна слабая
  const q = buildWeakestBid(weakRound(), mid);
  assert.equal(q.kind, KIND_WEAKEST_BID);
  assert.equal(q.input, 'bid');
  assert.equal(q.options.length, WEAK_CHOICES);
  assert.deepEqual(q.options.map((o) => o.n), [1, 2, 3]);
  assert.equal(q.answer, '2');
  assert.match(q.explain, /Меньше всего у/);
  assert.ok(q.options.every((o) => /× [⚀-⚅]$/.test(o.label)));
});

test('buildWeakestBid: если минимум не один — вопрос не задаётся', () => {
  const r = weakRound({ hands: [[3, 3], [5, 5], [5, 5], [3, 2]], bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }, { s: 3, q: 2, f: 6 }] });
  // у Ирины 2, у Алексея 0, у Юлии 0 → два минимума (Алексей и Юлия)
  assert.equal(buildWeakestBid(r, mid), null);
});

test('buildWeakestBid: ваши ставки и раунды с малым числом ставок не годятся', () => {
  assert.equal(buildWeakestBid(weakRound({ bids: [{ s: 1, q: 2, f: 5 }, { s: 0, q: 2, f: 6 }, { s: 3, q: 3, f: 4 }] }), mid), null);
  assert.equal(buildWeakestBid(weakRound({ bids: [] }), mid), null);
  assert.equal(buildWeakestBid(null, mid), null);
});

test('buildWeakestBid: ответ проверяется как обычный выбор', () => {
  const q = buildWeakestBid(weakRound(), mid);
  assert.equal(gradeQuestion(q, '2').ok, true);
  assert.equal(gradeQuestion(q, '1').ok, false);
});

test('баланс «самой слабой»: позиция ответа и «самая крупная ставка» не дают больше 55 %', () => {
  const pos = [0, 0, 0];
  let biggest = 0;
  let n = 0;
  let seq = 7;
  const rnd = () => { seq = (seq * 48271) % 2147483647; return seq / 2147483647; };
  for (let seed = 1; seed <= 4000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildWeakestBid(r, rnd);
    if (!q) continue;
    n++;
    pos[q.options.findIndex((o) => o.v === q.answer)]++;
    const big = q.options.reduce((a, o) => (o.q > a.q ? o : a), q.options[0]);
    if (q.options.filter((o) => o.q === big.q).length === 1 && big.v === q.answer) biggest++;
  }
  assert.ok(n >= 400, `мало вопросов: ${n}`);
  assert.ok(Math.max(...pos) / n <= 0.55, JSON.stringify(pos));
  assert.ok(biggest / n <= 0.55, `самая крупная ставка угадывает ${biggest}/${n}`);
});
