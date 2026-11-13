import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUIZ_SAVE_VERSION, MAX_AGE_MS, makeQuizSnapshot, restoreQuizSnapshot, sanitizeQuestion, describeSavedSeries,
} from '../src/quiz_save.js';
import { createSeries, submitAnswer, currentQuestion, totalQuestions } from '../src/quiz_series.js';
import { PER_TABLE } from '../src/table_quiz.js';

const NOW = 1_800_000_000_000;

/** Серия с детерминированным генератором и n данными ответами (первый вариант или число 1). */
function seriesWith(n, seed = 7) {
  let x = seed;
  const rnd = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
  let s = createSeries({ rounds: [], rnd });
  for (let i = 0; i < n; i++) {
    const cur = currentQuestion(s);
    s = submitAnswer(s, cur.question.input === 'number' ? 1 : cur.question.options[0].v).series;
  }
  return s;
}
/** Копия через JSON, как после записи в хранилище и чтения обратно. */
const wire = (o) => JSON.parse(JSON.stringify(o));
const snap = (n = 6, revealed = 1, seed = 7) => wire(makeQuizSnapshot(seriesWith(n, seed), revealed, NOW));

describe('makeQuizSnapshot', () => {
  test('снимок: версия, время, столы, ответы, показанные вскрытия', () => {
    const s = seriesWith(6);
    const m = makeQuizSnapshot(s, 1, NOW);
    assert.equal(m.v, QUIZ_SAVE_VERSION);
    assert.equal(m.savedAt, NOW);
    assert.equal(m.tables.length, 5);
    assert.equal(m.answers.length, 6);
    assert.equal(m.revealed, 1);
    assert.ok(!('results' in m) && !JSON.stringify(m).includes('"points"'), 'баллы в снимок не пишутся');
  });
  test('нечего сохранять: нет ответов, серия закончена, пустая или не серия', () => {
    assert.equal(makeQuizSnapshot(seriesWith(0), 0, NOW), null);
    const all = seriesWith(20);
    assert.equal(totalQuestions(all), 20);
    assert.equal(makeQuizSnapshot(all, 5, NOW), null);
    assert.equal(makeQuizSnapshot({ tables: [], results: [] }, 0, NOW), null);
    for (const v of [null, undefined, 5, 'x', {}, { tables: 1, results: 1 }]) assert.equal(makeQuizSnapshot(v, 0, NOW), null);
  });
  test('число показанных вскрытий ограничено столами серии', () => {
    assert.equal(makeQuizSnapshot(seriesWith(6), 99, NOW).revealed, 5);
    assert.equal(makeQuizSnapshot(seriesWith(6), -3, NOW).revealed, 0);
    assert.equal(makeQuizSnapshot(seriesWith(6), 'abc', NOW).revealed, 0);
  });
});

describe('restoreQuizSnapshot: круг «записали — прочитали»', () => {
  test('после записи в JSON серия восстанавливается один в один', () => {
    for (const n of [1, 3, 4, 5, 6, 8, 12, 15, 19]) {
      const s = seriesWith(n, 11 + n);
      const done = Math.floor(n / PER_TABLE);
      const m = wire(makeQuizSnapshot(s, done, NOW));
      const r = restoreQuizSnapshot(m, NOW + 1000);
      assert.ok(r, `n=${n}`);
      assert.deepEqual(r.series.tables, s.tables, `n=${n}: столы`);
      assert.deepEqual(r.series.results, s.results, `n=${n}: результаты пересчитаны`);
      assert.equal(r.revealed, done);
    }
  });
  test('много случайных серий: восстановление всегда успешно и согласовано', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 1 + (seed * 7) % 19;
      const s = seriesWith(n, seed * 31);
      const done = Math.floor(n / PER_TABLE);
      const r = restoreQuizSnapshot(wire(makeQuizSnapshot(s, done, NOW)), NOW);
      assert.ok(r, `seed=${seed} n=${n}`);
      assert.deepEqual(r.series.results, s.results);
    }
  });
  test('вскрытие стола, которое вы не видели: revealed на единицу меньше законченных столов', () => {
    const r = restoreQuizSnapshot(snap(4, 0), NOW);
    assert.ok(r);
    assert.equal(r.revealed, 0);
    assert.equal(describeSavedSeries(r.series, r.revealed).pendingReveal, true);
  });
  test('результат не берётся из хранилища: подмена ok и points в снимке ни на что не влияет', () => {
    const m = snap(6, 1);
    m.results = [{ ok: true, points: 99, max: 99 }];
    const r = restoreQuizSnapshot(m, NOW);
    assert.ok(r.series.results.every((x) => x.points <= x.max && x.max <= 2));
  });
});

describe('restoreQuizSnapshot: отбрасывает негодное', () => {
  test('не снимок', () => {
    for (const v of [null, undefined, 0, 1, 'x', [], [1], true, () => 1, {}]) assert.equal(restoreQuizSnapshot(v, NOW), null);
  });
  test('версия и время', () => {
    const m = snap();
    assert.equal(restoreQuizSnapshot({ ...m, v: 0 }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, v: QUIZ_SAVE_VERSION + 1 }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, v: undefined }, NOW), null);
    assert.ok(restoreQuizSnapshot(m, NOW + MAX_AGE_MS), 'ровно 7 суток ещё годится');
    assert.equal(restoreQuizSnapshot(m, NOW + MAX_AGE_MS + 1), null, 'старше 7 суток отбрасывается');
    assert.equal(restoreQuizSnapshot({ ...m, savedAt: NOW + 3 * 24 * 3600 * 1000 }, NOW), null, 'из будущего');
    for (const t of ['1', null, NaN, Infinity, {}]) assert.equal(restoreQuizSnapshot({ ...m, savedAt: t }, NOW), null);
  });
  test('столы: число, форма, число вопросов', () => {
    const m = snap();
    assert.equal(restoreQuizSnapshot({ ...m, tables: [] }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, tables: 'x' }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, tables: Array(9).fill(m.tables[0]) }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, tables: [...m.tables.slice(0, 4), null] }, NOW), null);
    const fewer = wire(m); fewer.tables[2].questions.pop();
    assert.equal(restoreQuizSnapshot(fewer, NOW), null);
  });
  test('ответы: пустые, лишние, чужой формы, вне границ', () => {
    const m = snap(6, 1);
    assert.equal(restoreQuizSnapshot({ ...m, answers: [] }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, answers: 'abc' }, NOW), null);
    assert.equal(restoreQuizSnapshot({ ...m, answers: Array(20).fill('1') }, NOW), null, 'законченную серию не предлагаем');
    assert.equal(restoreQuizSnapshot({ ...m, answers: Array(25).fill('1') }, NOW), null);
    for (const bad of [null, undefined, {}, [], 'zzz', 1.5, -1, 1e9, NaN]) {
      const x = wire(m); x.answers[0] = bad;
      assert.equal(restoreQuizSnapshot(x, NOW), null, String(bad));
    }
  });
  test('число-ответ: целое в границах вопроса, строка не годится', () => {
    // find the count question index among the first 6 answers
    const s = seriesWith(6);
    const idx = s.results.findIndex((r) => r.kind === 'countFace');
    if (idx < 0) return;
    const m = snap(6, 1);
    const ok = wire(m); ok.answers[idx] = 0;
    assert.ok(restoreQuizSnapshot(ok, NOW));
    const bad = wire(m); bad.answers[idx] = 99;
    assert.equal(restoreQuizSnapshot(bad, NOW), null);
    const str = wire(m); str.answers[idx] = 'x';
    assert.equal(restoreQuizSnapshot(str, NOW), null);
  });
  test('показанные вскрытия: больше законченных столов или отстают больше чем на один', () => {
    const m = snap(9, 2);   // два законченных стола
    assert.ok(restoreQuizSnapshot(m, NOW));
    for (const bad of [3, 5, -1, 0, 1.5, '2', null, undefined, NaN]) {
      if (bad === 1) continue;
      assert.equal(restoreQuizSnapshot({ ...m, revealed: bad }, NOW), null, String(bad));
    }
    assert.ok(restoreQuizSnapshot({ ...m, revealed: 1 }, NOW), 'одно вскрытие ещё не показано — допустимо');
  });
  test('раунд с испорченными данными отбрасывает снимок', () => {
    const m = snap();
    const a = wire(m); a.tables[0].round.hands[0] = [9, 9];
    assert.equal(restoreQuizSnapshot(a, NOW), null);
    const b = wire(m); b.tables[1].round.bids = [];
    assert.equal(restoreQuizSnapshot(b, NOW), null);
    const c = wire(m); c.tables[0].round.end.actual += 1;
    assert.equal(restoreQuizSnapshot(c, NOW), null);
    const d = wire(m); d.tables[3].round = null;
    assert.equal(restoreQuizSnapshot(d, NOW), null);
  });
  test('подмена правильного ответа или варианта отбрасывает снимок', () => {
    for (let t = 0; t < 5; t++) {
      for (let qi = 0; qi < PER_TABLE; qi++) {
        const m = snap();
        const q = m.tables[t].questions[qi];
        if (q.input === 'number') q.answer += 1; else q.answer = q.options.find((o) => o.v !== q.answer).v;
        assert.equal(restoreQuizSnapshot(m, NOW), null, `стол ${t} вопрос ${qi} (${q.kind})`);
      }
    }
  });
  test('подмена ставки или игрока в вариантах', () => {
    const m = snap();
    const flips = [];
    m.tables.forEach((t, ti) => t.questions.forEach((q, qi) => { if (q.kind === 'weakestBid') flips.push([ti, qi]); }));
    assert.ok(flips.length > 0);
    const [ti, qi] = flips[0];
    const a = wire(m); a.tables[ti].questions[qi].options[0].q += 1;
    assert.equal(restoreQuizSnapshot(a, NOW), null);
    const b = wire(m); b.tables[ti].questions[qi].options[1].n = b.tables[ti].questions[qi].options[0].n;
    assert.equal(restoreQuizSnapshot(b, NOW), null);
    const c = wire(m); c.tables[ti].questions[qi].options.pop();
    assert.equal(restoreQuizSnapshot(c, NOW), null);
  });
  test('текстовые поля: не строки и слишком длинные', () => {
    const m = snap();
    for (const f of ['title', 'short', 'explain']) {
      for (const bad of [null, 5, '', 'x'.repeat(5000), {}]) {
        const x = wire(m); x.tables[0].questions[0][f] = bad;
        assert.equal(restoreQuizSnapshot(x, NOW), null, `${f}=${String(bad).slice(0, 10)}`);
      }
    }
    const l = wire(m); l.tables[0].questions[0].lines = Array(50).fill('a');
    assert.equal(restoreQuizSnapshot(l, NOW), null);
    const e = wire(m); e.tables[0].questions[0].lines = [];
    assert.equal(restoreQuizSnapshot(e, NOW), null);
  });
  test('лишние и опасные поля не переносятся', () => {
    const m = snap();
    const x = wire(m);
    x.tables[0].questions[0].evil = '<img src=x onerror=alert(1)>';
    x.tables[0].questions[0].__proto__ = { polluted: true };
    x.extra = 1;
    JSON.parse('{"__proto__": {"polluted": true}}');
    const r = restoreQuizSnapshot(x, NOW);
    assert.ok(r);
    assert.ok(!('evil' in r.series.tables[0].questions[0]));
    assert.equal({}.polluted, undefined);
    assert.equal(r.series.tables[0].questions[0].polluted, undefined);
  });
  test('никогда не бросает исключение', () => {
    const weird = [
      { v: 1, savedAt: NOW, tables: [{ round: { hands: 'x' }, questions: 5 }], answers: [1], revealed: 0 },
      { v: 1, savedAt: NOW, tables: [{}], answers: [null], revealed: 0 },
      { v: 1, savedAt: NOW, tables: [null], answers: [1], revealed: 0 },
      Object.create(null),
      new Proxy({}, { get() { throw new Error('boom'); } }),
    ];
    for (const w of weird) assert.doesNotThrow(() => restoreQuizSnapshot(w, NOW));
  });
  test('вход не меняется', () => {
    const m = snap(6, 1);
    const before = JSON.stringify(m);
    restoreQuizSnapshot(m, NOW);
    assert.equal(JSON.stringify(m), before);
  });
  test('восстановленные данные не делят объекты с входом', () => {
    const m = snap(6, 1);
    const r = restoreQuizSnapshot(m, NOW);
    r.series.tables[0].questions[0].title = 'изменено';
    r.series.tables[0].round.hands[0].push(1);
    assert.notEqual(m.tables[0].questions[0].title, 'изменено');
  });
});

describe('sanitizeQuestion', () => {
  test('вопрос, собранный построителем, проходит проверку', () => {
    const s = seriesWith(0, 5);
    for (const t of s.tables) for (const q of t.questions) {
      const c = sanitizeQuestion(t.round, wire(q));
      assert.ok(c, q.kind);
      assert.equal(c.answer, q.answer);
      assert.deepEqual(c.options, q.options);
    }
  });
  test('не вопрос', () => {
    const t = seriesWith(0).tables[0];
    for (const v of [null, 1, 'x', [], {}, { kind: 'nope' }, { kind: 'countFace', input: 'two' }]) assert.equal(sanitizeQuestion(t.round, v), null);
  });
});

describe('describeSavedSeries', () => {
  test('внутри стола: сколько ответов, какой стол', () => {
    const s = seriesWith(13);
    assert.deepEqual(describeSavedSeries(s, 3), { answered: 13, total: 20, table: 4, tables: 5, pendingReveal: false });
  });
  test('стол закончен, вскрытие не показано: показывается этот стол', () => {
    const s = seriesWith(12);
    assert.deepEqual(describeSavedSeries(s, 2), { answered: 12, total: 20, table: 3, tables: 5, pendingReveal: true });
  });
  test('стол закончен и вскрытие показано: следующий стол', () => {
    const s = seriesWith(12);
    assert.deepEqual(describeSavedSeries(s, 3), { answered: 12, total: 20, table: 4, tables: 5, pendingReveal: false });
  });
});
