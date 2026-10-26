// data_schema.test.js — единый слой проверки данных: статистика игрока.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeStats, toCount, isSafeKey, MAX_COUNT, MAX_KEYS } from '../src/data_schema.js';

const EMPTY = {
  n: 0, good: 0, totalGames: 0, totalWins: 0, totalDecisions: 0, goodDecisions: 0,
  byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } },
};

describe('toCount и isSafeKey', () => {
  it('счётчик: неотрицательное целое, дробное вниз, потолок, остальное null', () => {
    assert.strictEqual(toCount(5), 5);
    assert.strictEqual(toCount(5.9), 5);
    assert.strictEqual(toCount(0), 0);
    assert.strictEqual(toCount(1e30), MAX_COUNT);
    for (const bad of [-1, NaN, Infinity, '5', null, undefined, {}, [], true]) assert.strictEqual(toCount(bad), null, String(bad));
  });
  it('ключ: строка до 64 символов, не служебная', () => {
    assert.strictEqual(isSafeKey('A'), true);
    for (const bad of ['', 'x'.repeat(65), '__proto__', 'constructor', 'prototype', 5, null]) assert.strictEqual(isSafeKey(bad), false);
  });
});

describe('sanitizeStats', () => {
  it('нет данных: значения по умолчанию, ничего не отброшено', () => {
    for (const v of [null, undefined]) assert.deepStrictEqual(sanitizeStats(v), { value: EMPTY, dropped: 0 });
  });
  it('не объект: значения по умолчанию, отброшено 1', () => {
    for (const v of ['x', 5, [], true]) assert.deepStrictEqual(sanitizeStats(v), { value: EMPTY, dropped: 1 });
  });
  it('корректные данные проходят без изменений', () => {
    const good = {
      n: 10, good: 7, totalGames: 3, totalWins: 2, totalDecisions: 20, goodDecisions: 15,
      byMode: { 'a-b': { n: 4, good: 3 } }, byTag: { risk: { n: 2, good: 1 } },
      drill: { A: { n: 5, good: 4 }, B: { n: 1, good: 0 } },
    };
    assert.deepStrictEqual(sanitizeStats(good), { value: good, dropped: 0 });
  });
  it('byTag не создаётся, если его не было', () => {
    assert.ok(!('byTag' in sanitizeStats({ n: 1, good: 1 }).value));
  });
  it('мусорные счётчики отбрасываются и считаются', () => {
    const r = sanitizeStats({ n: '5', good: -1, totalGames: NaN, totalWins: null });
    assert.strictEqual(r.value.n, 0);
    assert.strictEqual(r.value.good, 0);
    assert.strictEqual(r.value.totalGames, 0);
    assert.ok(r.dropped >= 3);
  });
  it('согласованность: good ≤ n, побед не больше партий, верных решений не больше решений', () => {
    const r = sanitizeStats({ n: 3, good: 10, totalGames: 2, totalWins: 9, totalDecisions: 4, goodDecisions: 8 });
    assert.strictEqual(r.value.good, 3);
    assert.strictEqual(r.value.totalWins, 2);
    assert.strictEqual(r.value.goodDecisions, 4);
  });
  it('byMode и byTag: негодные записи и служебные ключи отбрасываются', () => {
    const raw = JSON.parse('{"byMode":{"ok":{"n":2,"good":1},"bad":{"n":"x","good":1},"arr":[],"__proto__":{"n":1,"good":1}},"byTag":5}');
    const r = sanitizeStats(raw);
    assert.deepStrictEqual(r.value.byMode, { ok: { n: 2, good: 1 } });
    assert.deepStrictEqual(r.value.byTag, {});
    assert.strictEqual(r.dropped, 4);
    assert.strictEqual(Object.getPrototypeOf(r.value.byMode), Object.prototype);
  });
  it('в таблице не больше MAX_KEYS записей', () => {
    const byTag = {};
    for (let i = 0; i < MAX_KEYS + 20; i++) byTag[`t${i}`] = { n: 1, good: 1 };
    const r = sanitizeStats({ byTag });
    assert.strictEqual(Object.keys(r.value.byTag).length, MAX_KEYS);
    assert.strictEqual(r.dropped, 20);
  });
  it('drill: неверный вид заменяется нулями', () => {
    assert.deepStrictEqual(sanitizeStats({ drill: 7 }).value.drill, EMPTY.drill);
    const r = sanitizeStats({ drill: { A: { n: 'x', good: 1 }, B: 3 } });
    assert.deepStrictEqual(r.value.drill, EMPTY.drill);
    assert.strictEqual(r.dropped, 2);
  });
  it('неизвестные поля не переносятся', () => {
    assert.ok(!('evil' in sanitizeStats({ evil: 1, n: 1 }).value));
  });
  it('повторная проверка ничего не меняет (идемпотентность)', () => {
    const raw = { n: 5.7, good: 9, byMode: { a: { n: 1, good: 5 }, b: 1 }, drill: { A: { n: 2, good: 1 } } };
    const once = sanitizeStats(raw).value;
    assert.deepStrictEqual(sanitizeStats(once), { value: once, dropped: 0 });
  });
  it('случайный мусор: не падает, результат всегда годен', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const junk = () => {
      const pool = [null, undefined, NaN, -1, 1e40, 'x', '', true, [], {}, [1], { n: 1 }, { n: 'a', good: 1 }, 3.5, 0];
      return pool[Math.floor(rnd() * pool.length)];
    };
    const keys = ['n', 'good', 'totalGames', 'totalWins', 'totalDecisions', 'goodDecisions', 'byMode', 'byTag', 'drill', 'zzz'];
    for (let i = 0; i < 500; i++) {
      const raw = {};
      for (const k of keys) if (rnd() < 0.6) raw[k] = junk();
      if (rnd() < 0.3) raw.byMode = { x: junk(), y: { n: junk(), good: junk() } };
      if (rnd() < 0.3) raw.drill = { A: junk(), B: { n: junk(), good: junk() } };
      const { value, dropped } = sanitizeStats(raw);
      assert.ok(Number.isInteger(dropped) && dropped >= 0);
      for (const k of ['n', 'good', 'totalGames', 'totalWins', 'totalDecisions', 'goodDecisions']) {
        assert.ok(Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= MAX_COUNT, k);
      }
      assert.ok(value.good <= value.n && value.totalWins <= value.totalGames && value.goodDecisions <= value.totalDecisions);
      assert.deepStrictEqual(sanitizeStats(value), { value, dropped: 0 });
    }
  });
});
