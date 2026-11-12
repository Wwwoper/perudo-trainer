import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleView, readerAnswer, bidTrueChance, READERS } from '../src/quiz_reader.js';
import { BUILDERS, gradeQuestion } from '../src/table_quiz.js';
import { simulateRound } from '../src/read_sim.js';

const lcg = (seed) => { let s = seed; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; };

test('visibleView: чужие руки стёрты, ваша и всё публичное на месте', () => {
  const r = simulateRound(3);
  const v = visibleView(r);
  assert.deepEqual(v.hands[r.me], r.hands[r.me]);
  v.hands.forEach((h, i) => { if (i !== r.me) assert.equal(h, null); });
  assert.deepEqual(v.dice, r.dice);
  assert.deepEqual(v.bids, r.bids);
});

test('bidTrueChance: ставка на меньше, чем у вас в руке, верна наверняка; на всё сверх стола — нет', () => {
  const v = { me: 0, wild: false, dice: [3, 2, 2], bids: [], hands: [[4, 4, 4], null, null] };
  assert.ok(bidTrueChance(v, { s: 1, q: 3, f: 4 }) > 0.999999);
  assert.equal(bidTrueChance(v, { s: 1, q: 9, f: 4 }), 0);
  const mid = bidTrueChance(v, { s: 1, q: 5, f: 4 });
  assert.ok(mid > 0 && mid < 1);
});

test('у читающего есть правило для каждого вида вопросов', () => {
  assert.deepEqual(Object.keys(READERS).sort(), Object.keys(BUILDERS).sort());
});

test('читающий отвечает по урезанному раунду: чужие руки ему не нужны', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = simulateRound(seed);
    for (const build of Object.values(BUILDERS)) {
      const q = r && build(r, lcg(seed));
      if (!q) continue;
      const a = READERS[q.kind](q, visibleView(r));
      assert.equal(a, readerAnswer(q, r));
    }
  }
});

test('решаемость: читающий обгоняет лучшую постоянную догадку на 8 п. п. и больше по каждому виду', () => {
  const rnd = lcg(20261109);
  const by = {};
  for (let seed = 1; seed <= 3000; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    for (const [kind, build] of Object.entries(BUILDERS)) {
      const q = build(r, rnd);
      if (q) (by[kind] ||= []).push({ q, r });
    }
  }
  assert.deepEqual(Object.keys(by).sort(), Object.keys(BUILDERS).sort());
  for (const [kind, items] of Object.entries(by)) {
    const max = items.reduce((a, { q }) => a + gradeQuestion(q, null).max, 0);
    const sums = new Map();
    for (const { q } of items) {
      const gs = q.input === 'number' ? Array.from({ length: 15 }, (_, c) => c) : q.options.map((o) => o.v);
      for (const g of gs) {
        const key = q.input === 'number' || q.input === 'two' ? g : q.options.findIndex((o) => o.v === g);
        sums.set(key, (sums.get(key) ?? 0) + gradeQuestion(q, g).points);
      }
    }
    const guess = Math.max(...sums.values()) / max;
    const read = items.reduce((a, { q, r }) => a + gradeQuestion(q, readerAnswer(q, r)).points, 0) / max;
    assert.ok(read - guess >= 0.08, `${kind}: догадка ${(guess * 100).toFixed(1)} %, читающий ${(read * 100).toFixed(1)} %`);
  }
});
