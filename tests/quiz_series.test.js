import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeries, currentQuestion, progress, submitAnswer, summarize, totalQuestions, kindBaselines,
  TABLES_DEFAULT, KIND_NAMES,
} from '../src/quiz_series.js';
import { PER_TABLE, BUILDERS } from '../src/table_quiz.js';
import { simulateRound } from '../src/read_sim.js';

const lcg = (seed) => { let s = seed; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; };
const fresh = (seed = 3, extra = {}) => createSeries({ rnd: lcg(seed), ...extra });

test('createSeries: 5 столов по 4 вопроса, учебные раунды, если своих нет', () => {
  const s = fresh();
  assert.equal(s.tables.length, TABLES_DEFAULT);
  assert.ok(s.tables.every((t) => t.questions.length === PER_TABLE));
  assert.equal(totalQuestions(s), 20);
  assert.deepEqual(s.results, []);
});

test('createSeries: число столов настраивается, одно зерно — одна серия', () => {
  assert.equal(fresh(3, { tables: 3 }).tables.length, 3);
  const a = fresh(9).tables.map((t) => t.questions.map((q) => q.title));
  const b = fresh(9).tables.map((t) => t.questions.map((q) => q.title));
  assert.deepEqual(a, b);
});

test('createSeries: свои раунды идут первыми, учебные дополняют', () => {
  const mine = [];
  for (let seed = 1; mine.length < 2 && seed < 500; seed++) {
    const r = simulateRound(seed);
    if (r) mine.push({ ...r, id: `real-${seed}` });
  }
  const s = createSeries({ rnd: lcg(5), rounds: mine });
  assert.equal(s.tables.length, 5);
  const real = s.tables.filter((t) => String(t.round.id).startsWith('real-'));
  assert.ok(real.length >= 1);
  assert.ok(s.tables.slice(0, real.length).every((t) => String(t.round.id).startsWith('real-')));
});

test('ход серии: вопросы идут по порядку, прогресс и конец', () => {
  let s = fresh();
  assert.deepEqual(progress(s), { table: 0, q: 0, done: false });
  const seen = [];
  let tablesDone = 0;
  while (currentQuestion(s)) {
    const cur = currentQuestion(s);
    seen.push(cur.question.title);
    const out = submitAnswer(s, cur.question.answer);
    assert.equal(out.result.ok, true);
    if (out.tableDone) tablesDone++;
    s = out.series;
  }
  assert.equal(seen.length, 20);
  assert.equal(tablesDone, 5);
  assert.equal(progress(s).done, true);
  assert.equal(currentQuestion(s), null);
  const after = submitAnswer(s, 'yes');
  assert.equal(after.result, null);
  assert.equal(after.series, s);
});

test('submitAnswer не меняет исходную серию', () => {
  const s = fresh();
  const out = submitAnswer(s, 'yes');
  assert.equal(s.results.length, 0);
  assert.equal(out.series.results.length, 1);
  assert.equal(out.tableDone, false);
});

test('summarize: все ответы верные — баллы выше лучшей догадки; пустая серия — нули', () => {
  let s = fresh();
  while (currentQuestion(s)) s = submitAnswer(s, currentQuestion(s).question.answer).series;
  const sum = summarize(s);
  assert.equal(sum.correct, 20);
  assert.equal(sum.points, sum.max);
  assert.ok(sum.guess > 0 && sum.guess < sum.max);
  assert.ok(sum.gain > 0);
  assert.equal(sum.weakest, null);
  assert.ok(sum.kinds.length >= 2);
  assert.ok(sum.kinds.every((k) => KIND_NAMES[k.kind] === k.name));
  const empty = summarize(fresh());
  assert.equal(empty.answered, 0);
  assert.equal(empty.points, 0);
  assert.equal(empty.weakest, null);
});

test('summarize: неверные ответы дают слабое место ниже догадки', () => {
  let s = fresh(11);
  while (currentQuestion(s)) {
    const { question } = currentQuestion(s);
    const wrong = question.input === 'number' ? question.answer + 5
      : (question.options.find((o) => o.v !== question.answer)?.v ?? 'x');
    s = submitAnswer(s, wrong).series;
  }
  const sum = summarize(s);
  assert.equal(sum.points, 0);
  assert.ok(sum.gain < 0);
  assert.ok(sum.weakest && sum.weakest.rate < sum.weakest.guessRate);
});

test('kindBaselines: у каждого вида есть доля лучшей догадки, и она разумна', () => {
  const b = kindBaselines();
  assert.deepEqual(Object.keys(b).sort(), Object.keys(BUILDERS).sort());
  for (const v of Object.values(b)) assert.ok(v > 0.3 && v <= 0.55, String(v));
  assert.equal(kindBaselines(), b);   // считается один раз
});
