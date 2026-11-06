import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SERIES, MAX_SERIES, toProbability, brierItem, sideCorrect, makeEntry, addEntry,
  seriesSummary, itemLine, seriesLines,
} from '../src/calibration.js';

const e = (p, prior, truth) => makeEntry({ p, prior, truth });

describe('toProbability', () => {
  test('целые 0–100 и числовые строки', () => {
    assert.equal(toProbability(0), 0);
    assert.equal(toProbability(70), 0.7);
    assert.equal(toProbability('100'), 1);
  });
  test('некорректное → null', () => {
    for (const v of [-1, 101, 7.5, NaN, '', ' ', 'abc', null, undefined, {}]) assert.equal(toProbability(v), null, String(v));
  });
});

describe('brierItem / sideCorrect', () => {
  test('ошибка прогноза', () => {
    assert.equal(brierItem(1, true), 0);
    assert.equal(brierItem(0, true), 1);
    assert.ok(Math.abs(brierItem(0.7, false) - 0.49) < 1e-12);
  });
  test('ровно 50 % — не верная сторона', () => {
    assert.equal(sideCorrect(0.5, true), false);
    assert.equal(sideCorrect(0.6, true), true);
    assert.equal(sideCorrect(0.4, false), true);
  });
});

describe('записи серии', () => {
  test('makeEntry отклоняет мусор', () => {
    assert.equal(makeEntry({ p: 2, prior: 0.3, truth: true }), null);
    assert.equal(makeEntry({ p: 0.5, prior: NaN, truth: true }), null);
    assert.equal(makeEntry({ p: 0.5, prior: 0.3, truth: 'yes' }), null);
    assert.deepEqual(e(0.5, 0.3, true), { p: 0.5, prior: 0.3, truth: true });
  });
  test('addEntry не меняет исходную серию и ограничивает длину', () => {
    const s = [e(0.5, 0.5, true)];
    const s2 = addEntry(s, e(0.2, 0.5, false));
    assert.equal(s.length, 1);
    assert.equal(s2.length, 2);
    assert.equal(addEntry(s, null).length, 1);
    assert.equal(addEntry(undefined, e(0.5, 0.5, true)).length, 1);
    let big = [];
    for (let i = 0; i < MAX_SERIES + 5; i++) big = addEntry(big, e(0.5, 0.5, true));
    assert.equal(big.length, MAX_SERIES);
  });
});

describe('seriesSummary', () => {
  test('пусто', () => {
    assert.deepEqual(seriesSummary([]), { n: 0, enough: false, brier: null, base: null, better: null, bands: [] });
    assert.equal(seriesSummary(null).n, 0);
  });
  test('мало ответов: оценки серии нет', () => {
    const s = seriesSummary([e(0.9, 0.5, true)]);
    assert.equal(s.enough, false);
    assert.equal(s.better, null);
    assert.match(seriesLines(s)[0], /после 10 ответов.*Сейчас: 1/);
  });
  test('точнее начального шанса', () => {
    const list = Array.from({ length: MIN_SERIES }, () => e(0.9, 0.5, true));
    const s = seriesSummary(list);
    assert.equal(s.enough, true);
    assert.equal(s.better, true);
    assert.ok(s.brier < s.base);
    assert.equal(s.bands.length, 1);
    assert.equal(s.bands[0].id, 'high');
    assert.match(seriesLines(s).join('\n'), /точнее, чем начальный шанс/);
  });
  test('хуже начального шанса', () => {
    const list = Array.from({ length: MIN_SERIES }, () => e(0.9, 0.5, false));
    const s = seriesSummary(list);
    assert.equal(s.better, false);
    assert.match(seriesLines(s).join('\n'), /не точнее начального шанса/);
  });
  test('полосы считают частоту', () => {
    const list = [
      ...Array.from({ length: 5 }, (_, i) => e(0.2, 0.5, i === 0)),
      ...Array.from({ length: 5 }, () => e(0.5, 0.5, true)),
    ];
    const s = seriesSummary(list);
    const low = s.bands.find((b) => b.id === 'low');
    assert.equal(low.n, 5);
    assert.ok(Math.abs(low.actual - 0.2) < 1e-12);
    assert.match(seriesLines(s).join('\n'), /до 33 %, цифра была в руке в 20 %/);
  });
  test('битые записи игнорируются', () => {
    assert.equal(seriesSummary([null, { p: 5 }, e(0.5, 0.5, true)]).n, 1);
  });
});

describe('тексты', () => {
  test('itemLine', () => {
    assert.equal(itemLine({ p: 0.7, truth: false }),
      'Ваша уверенность 70 %. В руке цифра не была. Ошибка прогноза 0,49 (меньше — лучше).');
    assert.match(itemLine({ p: 0.7, truth: true }), /цифра была.*0,09/);
  });
  test('нет запрещённых слов', () => {
    const list = Array.from({ length: 12 }, (_, i) => e(0.8, 0.4, i % 2 === 0));
    const txt = [...seriesLines(seriesSummary(list)), itemLine({ p: 0.3, truth: true })].join(' ');
    assert.doesNotMatch(txt, /обманщик|врёт|блефует/i);
  });
});
