import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulateRound, makeSimRound, chooseSource, seededRng, isSimRound, SIM_PREFIX, REAL_ENOUGH } from '../src/read_sim.js';
import { sanitizeRound, countFace } from '../src/rounds.js';
import { canRead, buildReadTask, checkReadAnswers } from '../src/read_drill.js';

describe('seededRng', () => {
  test('одно зерно — одна последовательность, значения в [0,1)', () => {
    const a = seededRng(7); const b = seededRng(7); const c = seededRng(8);
    const xs = Array.from({ length: 50 }, () => a());
    assert.deepEqual(xs, Array.from({ length: 50 }, () => b()));
    assert.ok(xs.every((x) => x >= 0 && x < 1));
    assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => c()));
  });
});

describe('simulateRound', () => {
  test('раунд воспроизводим и проходит проверку sanitizeRound', () => {
    let made = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulateRound(seed);
      if (!r) continue;
      made++;
      assert.deepEqual(r, simulateRound(seed), `зерно ${seed}`);
      assert.deepEqual(sanitizeRound(r), r);
      assert.equal(r.id, `${SIM_PREFIX}${seed}`);
      assert.equal(isSimRound(r), true);
      assert.equal(r.me, 0);
      assert.ok(r.dice.length >= 3 && r.dice.length <= 4);
      assert.equal(r.styles[0], null);
      assert.equal(countFace(r.hands, r.bids.at(-1).f, r.wild), r.end.actual);
    }
    assert.ok(made > 250, `получилось ${made} из 300`);
  });
  test('раунды разнообразны: разные места, цифры и итоги', () => {
    const rs = Array.from({ length: 120 }, (_, i) => simulateRound(i + 1)).filter(Boolean);
    assert.ok(new Set(rs.map((r) => r.dice.length)).size >= 2);
    assert.ok(new Set(rs.map((r) => r.bids.at(-1).f)).size >= 4);
    assert.ok(rs.some((r) => r.end.ok) && rs.some((r) => !r.end.ok));
    assert.ok(rs.some((r) => !r.wild) && rs.some((r) => r.wild));
  });
});

describe('makeSimRound', () => {
  test('всегда годится для упражнения и собирается в задание', () => {
    for (const seed of [1, 2, 3, 99, 12345, 4294967295]) {
      const r = makeSimRound(seed);
      assert.ok(r, `зерно ${seed}`);
      assert.equal(canRead(r), true);
      const t = buildReadTask(r);
      assert.ok(t && t.questions.length >= 1);
      const ans = Object.fromEntries(t.questions.map((q) => [q.n, 80]));
      assert.ok(checkReadAnswers(r, t, ans));
    }
  });
  test('нечисловое зерно не ломает', () => {
    assert.ok(makeSimRound('abc') === null || canRead(makeSimRound('abc')));
    assert.ok(makeSimRound(undefined) === null || canRead(makeSimRound(undefined)));
  });
});

describe('chooseSource', () => {
  test('без настоящих раундов — всегда учебные', () => {
    for (const n of [0, -1, NaN, undefined, null]) assert.equal(chooseSource(n, () => 0.99), 'sim');
  });
  test('достаточно настоящих — только они', () => {
    assert.equal(chooseSource(REAL_ENOUGH, () => 0), 'real');
    assert.equal(chooseSource(40, () => 0), 'real');
  });
  test('мало настоящих — вперемешку', () => {
    assert.equal(chooseSource(2, () => 0.1), 'sim');
    assert.equal(chooseSource(2, () => 0.9), 'real');
  });
});
