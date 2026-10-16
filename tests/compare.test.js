// compare.test.js — сравнение вариантов хода и подбор безопасной ставки.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compareOptions, bestSafeRaise } from '../src/compare.js';
import { legal } from '../src/rules.js';

// Настоящие вероятности из core.js (классический скрипт — выполняем в изолированном контексте).
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'), sandbox, { filename: 'core.js' });
const real = sandbox.self.Perudo.probBid;

// Простая модель для точных проверок: чем больше количество, тем ниже шанс.
const fake = (q) => Math.max(0, 1 - q / 10);

describe('bestSafeRaise', () => {
  it('выбирает наибольшее количество среди ставок с шансом не ниже порога', () => {
    // шанс 1 − q/10 ≥ 0,5 → q ≤ 5; допустимые повышения «3×3»: от 3×4 и дальше
    const r = bestSafeRaise({ q: 3, f: 3 }, 12, [], { wild: true }, 0.5, fake);
    assert.equal(r.q, 5);
    assert.ok(legal(r.q, r.f, { q: 3, f: 3 }, { wild: true }));
  });
  it('при равном количестве берёт ставку с большим шансом', () => {
    const p = (q, f) => (q === 4 ? (f === 5 ? 0.9 : 0.6) : 0);
    const r = bestSafeRaise({ q: 3, f: 3 }, 12, [], { wild: true }, 0.5, p);
    assert.deepEqual(r, { q: 4, f: 5, p: 0.9 });
  });
  it('порог по умолчанию 0,5; недостижимый порог — null', () => {
    assert.ok(bestSafeRaise({ q: 3, f: 3 }, 12, [], { wild: true }, undefined, fake));
    assert.equal(bestSafeRaise({ q: 3, f: 3 }, 12, [], { wild: true }, 1.01, fake), null);
  });
  it('нет допустимых повышений — null', () => {
    assert.equal(bestSafeRaise({ q: 5, f: 1 }, 5, [], { wild: true }, 0, fake), null);
  });
  it('Палифико: только та же цифра и большее количество', () => {
    const r = bestSafeRaise({ q: 2, f: 3 }, 8, [], { wild: false }, 0.5, fake);
    assert.equal(r.f, 3);
    assert.ok(r.q > 2);
  });
  it('с настоящими вероятностями результат допустим и достигает порога', () => {
    const bid = { q: 4, f: 4 };
    const r = bestSafeRaise(bid, 14, [4, 4, 1, 5, 6], { wild: true }, 0.5, real);
    assert.ok(r && r.p >= 0.5);
    assert.ok(legal(r.q, r.f, bid, { wild: true }));
  });
});

describe('compareOptions: состав вариантов', () => {
  it('проверка, минимальное повышение и безопасная ставка', () => {
    const { bidP, options } = compareOptions({
      bid: { q: 3, f: 3 }, total: 12, hand: [], threshold: 0.5, probBid: fake,
    });
    assert.equal(bidP, 0.7);
    assert.deepEqual(options.map((o) => o.type), ['dudo', 'minRaise', 'safeRaise']);
    const [dudo, min, safe] = options;
    assert.equal(dudo.p, 0.7);
    assert.ok(Math.abs(dudo.success - 0.3) < 1e-12);      // шанс, что проверка сработает
    assert.equal(dudo.meetsThreshold, false);             // ставка вероятна — проверка слабая
    assert.deepEqual([min.q, min.f], [2, 1]);             // на единицы достаточно половины: «2×1»
    assert.equal(min.success, min.p);
    assert.equal(min.meetsThreshold, true);
    assert.equal(safe.q, 5);
    assert.equal(safe.meetsThreshold, true);
  });
  it('маловероятная ставка: проверка проходит порог', () => {
    const { options } = compareOptions({ bid: { q: 9, f: 2 }, total: 12, hand: [], probBid: fake });
    assert.equal(options[0].type, 'dudo');
    assert.equal(options[0].meetsThreshold, true);        // p = 0,1 < 0,5
  });
  it('если минимальное повышение и есть самая сильная безопасная ставка — один вариант с флагом', () => {
    // безопасна только ставка 4×1 (минимальная для «3×1»)
    const p = (q, f) => (q === 4 && f === 1 ? 0.8 : 0.1);
    const { options } = compareOptions({ bid: { q: 3, f: 1 }, total: 12, hand: [], probBid: p });
    assert.deepEqual(options.map((o) => o.type), ['dudo', 'minRaise']);
    assert.equal(options[1].isBestSafe, true);
  });
  it('нет безопасных повышений: остаются проверка и минимальное повышение', () => {
    const { options } = compareOptions({ bid: { q: 3, f: 3 }, total: 12, hand: [], probBid: () => 0.1 });
    assert.deepEqual(options.map((o) => o.type), ['dudo', 'minRaise']);
    assert.equal(options[1].meetsThreshold, false);
    assert.equal('isBestSafe' in options[1], false);
  });
  it('нет допустимых повышений: только проверка', () => {
    const { options } = compareOptions({ bid: { q: 5, f: 1 }, total: 5, hand: [], probBid: fake });
    assert.deepEqual(options.map((o) => o.type), ['dudo']);
  });
  it('первый ход в раунде: проверять нечего', () => {
    const { bidP, options } = compareOptions({ bid: null, total: 10, hand: [4, 4], probBid: fake });
    assert.equal(bidP, null);
    assert.ok(options.every((o) => o.type !== 'dudo'));
    assert.ok(options.length >= 1);
  });
  it('Палифико: единицы не джокеры и повышение только по той же цифре', () => {
    const calls = [];
    const p = (q, f, n, h, wild) => { calls.push(wild); return 0.7; };
    const { options } = compareOptions({ bid: { q: 2, f: 3 }, total: 8, hand: [3], wild: false, probBid: p });
    assert.ok(calls.length > 0 && calls.every((w) => w === false));
    const min = options.find((o) => o.type === 'minRaise');
    assert.deepEqual([min.q, min.f], [3, 3]);
  });
  it('порог: граничное значение шанса засчитывается как безопасное, а проверка — нет', () => {
    const { options } = compareOptions({ bid: { q: 3, f: 3 }, total: 12, hand: [], threshold: 0.7, probBid: () => 0.7 });
    assert.equal(options[0].meetsThreshold, false);       // p < порога ложно при p = порогу
    assert.equal(options[1].meetsThreshold, true);        // p ≥ порога
  });
  it('нечисловой порог заменяется на 0,5', () => {
    const { options } = compareOptions({ bid: { q: 9, f: 2 }, total: 12, hand: [], threshold: NaN, probBid: fake });
    assert.equal(options[0].meetsThreshold, true);
  });
});

describe('compareOptions: проверка входа', () => {
  const ok = { bid: { q: 3, f: 3 }, total: 12, hand: [1], probBid: fake };
  it('без probBid — TypeError', () => {
    assert.throws(() => compareOptions({ ...ok, probBid: undefined }), TypeError);
  });
  it('неверное число кубиков или рука', () => {
    assert.throws(() => compareOptions({ ...ok, total: 0 }), RangeError);
    assert.throws(() => compareOptions({ ...ok, total: 2.5 }), RangeError);
    assert.throws(() => compareOptions({ ...ok, hand: 'abc' }), RangeError);
    assert.throws(() => compareOptions({ ...ok, total: 2, hand: [1, 2, 3] }), RangeError);
  });
  it('неверная ставка', () => {
    assert.throws(() => compareOptions({ ...ok, bid: { q: 0, f: 3 } }), TypeError);
    assert.throws(() => compareOptions({ ...ok, bid: { q: 3, f: 7 } }), TypeError);
    assert.throws(() => compareOptions({ ...ok, bid: 'x' }), TypeError);
  });
  it('входные данные не меняются', () => {
    const input = { bid: { q: 3, f: 3 }, total: 12, hand: [1, 2], probBid: fake };
    const copy = JSON.stringify({ ...input, probBid: null });
    compareOptions(input);
    assert.equal(JSON.stringify({ ...input, probBid: null }), copy);
  });
});

describe('compareOptions: с настоящими вероятностями', () => {
  it('числа согласованы: шанс проверки = 1 − шанс ставки, вероятности в [0, 1]', () => {
    const { bidP, options } = compareOptions({
      bid: { q: 7, f: 5 }, total: 14, hand: [5, 5, 1, 2, 6], probBid: real,
    });
    assert.ok(bidP > 0 && bidP < 1);
    const dudo = options.find((o) => o.type === 'dudo');
    assert.ok(Math.abs(dudo.success - (1 - bidP)) < 1e-12);
    for (const o of options) assert.ok(o.p >= 0 && o.p <= 1);
  });
  it('каждое предложенное повышение допустимо', () => {
    const bid = { q: 7, f: 5 };
    const { options } = compareOptions({ bid, total: 14, hand: [5, 5, 1, 2, 6], probBid: real });
    for (const o of options.filter((x) => x.type !== 'dudo')) {
      assert.ok(legal(o.q, o.f, bid, { wild: true }));
    }
  });
});
