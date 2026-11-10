import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_TAGS, QUIZ_LABELS, QUIZ_BASELINE, addQuizResults, isGoodAnswer, lastSeriesRecord, lastSeriesText } from '../src/quiz_stats.js';
import { BUILDERS, gradeQuestion } from '../src/table_quiz.js';
import { simulateRound } from '../src/read_sim.js';

test('у каждого вида вопросов есть тема, название и доля догадки', () => {
  for (const kind of Object.keys(BUILDERS)) {
    const tag = QUIZ_TAGS[kind];
    assert.ok(tag, kind);
    assert.ok(QUIZ_LABELS[tag], tag);
    assert.ok(QUIZ_BASELINE[tag] > 0.3 && QUIZ_BASELINE[tag] <= 0.6, tag);
  }
});

test('QUIZ_BASELINE совпадает с пересчётом по учебным столам (±0,02)', () => {
  let s = 20261109;
  const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const by = {};
  for (let seed = 1; seed <= 3000; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    for (const [kind, build] of Object.entries(BUILDERS)) {
      const q = build(r, rnd);
      if (q) (by[kind] ||= []).push(q);
    }
  }
  for (const [kind, qs] of Object.entries(by)) {
    const sums = new Map();
    for (const q of qs) {
      const guesses = q.input === 'number' ? Array.from({ length: 15 }, (_, c) => c) : q.options.map((_, i) => i);
      for (const g of guesses) {
        const v = q.input === 'number' ? g : q.options[g].v;
        const gr = gradeQuestion(q, v);
        sums.set(g, (sums.get(g) ?? 0) + ((gr.ok || gr.points > 0) ? 1 : 0));
      }
    }
    const best = Math.max(...sums.values()) / qs.length;
    assert.ok(Math.abs(best - QUIZ_BASELINE[QUIZ_TAGS[kind]]) <= 0.02, `${kind}: ${best.toFixed(3)}`);
  }
});

test('isGoodAnswer: у числа «почти» тоже верно, у остальных только точный', () => {
  assert.equal(isGoodAnswer({ kind: 'countFace', ok: false, points: 1 }), true);
  assert.equal(isGoodAnswer({ kind: 'countFace', ok: false, points: 0 }), false);
  assert.equal(isGoodAnswer({ kind: 'lastTrue', ok: true, points: 1 }), true);
  assert.equal(isGoodAnswer({ kind: 'lastTrue', ok: false, points: 0 }), false);
  assert.equal(isGoodAnswer(null), false);
});

test('addQuizResults: счётчики растут, исходный объект и чужие темы не трогаются', () => {
  const before = { read: { n: 5, good: 4 }, quizLast: { n: 2, good: 1 } };
  const out = addQuizResults(before, [
    { kind: 'lastTrue', ok: true, points: 1 },
    { kind: 'lastTrue', ok: false, points: 0 },
    { kind: 'countFace', ok: false, points: 1 },
    { kind: 'unknown', ok: true, points: 1 },
  ]);
  assert.deepEqual(out.quizLast, { n: 4, good: 2 });
  assert.deepEqual(out.quizCount, { n: 1, good: 1 });
  assert.deepEqual(out.read, { n: 5, good: 4 });
  assert.deepEqual(before.quizLast, { n: 2, good: 1 });
  assert.deepEqual(addQuizResults(null, null), {});
  assert.deepEqual(addQuizResults({ quizLast: 'мусор' }, [{ kind: 'lastTrue', ok: true, points: 1 }]).quizLast, { n: 1, good: 1 });
});

test('lastSeriesRecord и lastSeriesText', () => {
  const rec = lastSeriesRecord({ correct: 14, total: 20, points: 17, max: 24, guess: 11.6 });
  assert.deepEqual(rec, { correct: 14, total: 20, points: 17, max: 24, guess: 12 });
  assert.equal(lastSeriesText(rec), 'Последняя серия: верно 14 из 20, баллов 17 из 24, на 5 лучше постоянной догадки.');
  assert.match(lastSeriesText({ ...rec, points: 10 }), /на 2 хуже/);
  assert.match(lastSeriesText({ ...rec, points: 12 }), /на уровне/);
  assert.equal(lastSeriesText(null), null);
  assert.equal(lastSeriesText({ total: 0 }), null);
});
