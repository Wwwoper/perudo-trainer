// weak_spots.test.js — выбор слабых тем по счётчикам решений.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { weakSpots, TRAIN_MODE, MIN_DECISIONS, MAX_WEAK } from '../src/weak_spots.js';
import { MOMENT_TAGS } from '../src/moments.js';

globalThis.Perudo = { pct: (x) => `${Math.round(x * 100)}%` };
const { weakSpotsHtml } = await import('../src/ui/weak_spots.js');

describe('weakSpots', () => {
  it('пустой и неверный профиль — ничего', () => {
    for (const v of [undefined, null, {}, [], 5, 'x']) assert.deepEqual(weakSpots(v), { weak: [], pending: [] });
  });
  it('мало решений — «пока мало данных», в слабые не попадает', () => {
    const r = weakSpots({ endgame: { n: MIN_DECISIONS - 1, good: 0 } });
    assert.deepEqual(r.weak, []);
    assert.equal(r.pending[0].tag, 'endgame');
    assert.equal(r.pending[0].n, MIN_DECISIONS - 1);
  });
  it('ровно минимум решений уже оценивается', () => {
    const r = weakSpots({ endgame: { n: MIN_DECISIONS, good: 2 } });
    assert.equal(r.weak.length, 1);
    assert.equal(r.weak[0].share, 0.25);
  });
  it('тема без ошибок не считается слабой', () => {
    assert.deepEqual(weakSpots({ dudo: { n: 20, good: 20 } }).weak, []);
  });
  it('порядок: меньшая доля первой, при равной — больше решений', () => {
    const r = weakSpots({
      dudo: { n: 10, good: 5 }, raise: { n: 20, good: 10 }, endgame: { n: 10, good: 2 },
    });
    assert.deepEqual(r.weak.map((w) => w.tag), ['endgame', 'raise', 'dudo']);
  });
  it('не больше трёх тем', () => {
    const by = {};
    for (const t of MOMENT_TAGS) by[t] = { n: 10, good: 5 };
    assert.equal(weakSpots(by).weak.length, MAX_WEAK);
  });
  it('кнопка (режим) только у тем с подходящим режимом', () => {
    const by = {};
    for (const t of MOMENT_TAGS) by[t] = { n: 10, good: 1 };
    for (const w of weakSpots(by, { limit: 10 }).weak) assert.equal(w.mode, TRAIN_MODE[w.tag] || null, w.tag);
    assert.equal(weakSpots(by, { limit: 10 }).weak.find((w) => w.tag === 'dudo').mode, null);
  });
  it('мусорные записи пропускаются', () => {
    const r = weakSpots({
      endgame: { n: 'x', good: 1 }, lastDie: { n: 5, good: 9 }, palifico: null, ones: { n: -1, good: 0 },
      bigTable: { n: 0, good: 0 }, чужая: { n: 10, good: 0 },
    });
    assert.deepEqual(r, { weak: [], pending: [] });
  });
});

describe('weakSpotsHtml', () => {
  it('нет данных — подсказка', () => {
    assert.match(weakSpotsHtml({}), /появятся темы/);
  });
  it('слабая тема: доля, число решений, кнопка только где есть режим', () => {
    const h = weakSpotsHtml({ endgame: { n: 10, good: 4 }, dudo: { n: 10, good: 3 } });
    assert.match(h, /Эндшпиль/);
    assert.match(h, /40% · 10 реш\./);
    assert.equal((h.match(/data-train="/g) || []).length, 1);
    assert.match(h, /data-train="endgame"/);
  });
  it('мало данных и нет слабых — явное сообщение и список тем', () => {
    const h = weakSpotsHtml({ lastDie: { n: 3, good: 1 } });
    assert.match(h, /Слабых мест пока не видно/);
    assert.match(h, /Пока мало данных: игра на последнем кубике \(3\)/);
  });
  it('экранирует текст', () => {
    assert.ok(!weakSpotsHtml({ endgame: { n: 10, good: 1 } }).includes('<script'));
  });
});
