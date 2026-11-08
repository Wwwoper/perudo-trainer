// trainer_grade.test.js — единое правило верного ответа Тренажёра.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gradeMove, bestChanceRaise } from '../src/trainer_grade.js';
import { gradeVerdictText, correctMoveText, VERDICT_GOOD, VERDICT_BAD, VERDICT_BEST_OF_BAD, VERDICT_WORSE, NO_GOOD_NOTE } from '../src/trainer_text.js';
import { legal } from '../src/rules.js';

const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'), sandbox, { filename: 'core.js' });
const probBid = (...a) => sandbox.self.Perudo.probBid(...a);

// ситуация из обращения: ни один ход не проходит порог 0,5
const BAD = { bid: { q: 8, f: 3 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, threshold: 0.5, probBid };

describe('gradeMove: нет хода, проходящего порог', () => {
  it('верен ход с наибольшим шансом успеха', () => {
    const top = bestChanceRaise(BAD.bid, 20, BAD.hand, true, probBid);
    const r = gradeMove({ ...BAD, choice: { type: 'raise', q: top.q, f: top.f } });
    assert.equal(r.noGoodMove, true);
    const dudoSuccess = 1 - probBid(8, 3, 20, BAD.hand, true);
    if (top.p > dudoSuccess) { assert.equal(r.good, true); assert.equal(r.best.type, 'raise'); }
    else assert.equal(r.best.type, 'dudo');
  });
  it('4×1 против 8×3: шанс 46,8% выше, чем 40,4% у «Не верю» — «Не верю» уступает', () => {
    const r = gradeMove({ ...BAD, choice: { type: 'dudo' } });
    assert.equal(r.noGoodMove, true);
    assert.ok(Math.abs(r.chosenSuccess - 0.4041) < 0.001);
    assert.equal(r.good, false);
    assert.ok(r.best.success > r.chosenSuccess);
  });
  it('выбранный ход не хуже лучшего — верен', () => {
    const r = gradeMove({ ...BAD, choice: { type: 'raise', q: 4, f: 1 } });
    assert.ok(Math.abs(r.chosenSuccess - 0.4678) < 0.001);
    assert.equal(r.good, true);
  });
  it('худшее повышение уступает лучшему и разбор называет верный ход', () => {
    const r = gradeMove({ ...BAD, choice: { type: 'raise', q: 15, f: 6 } });
    assert.equal(r.good, false);
    assert.equal(r.best.type, 'raise');
    assert.ok(legal(r.best.q, r.best.f, BAD.bid, { wild: true }));
  });
});

describe('gradeMove: есть ход, проходящий порог', () => {
  const OK = { bid: { q: 15, f: 4 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, threshold: 0.5, probBid };
  it('«Не верю» слабой ставке верно; повышение ниже порога — нет', () => {
    assert.equal(gradeMove({ ...OK, choice: { type: 'dudo' } }).good, true);
    const r = gradeMove({ ...OK, choice: { type: 'raise', q: 16, f: 4 } });
    assert.equal(r.good, false);
    assert.equal(r.noGoodMove, false);
    assert.equal(r.best.type, 'dudo');
  });
  it('любой проходящий ход верен, не только самый сильный', () => {
    const s = { bid: { q: 3, f: 6 }, total: 20, hand: [6, 6, 6, 1, 2], wild: true, threshold: 0.5, probBid };
    const safe = gradeMove({ ...s, choice: { type: 'raise', q: 4, f: 6 } });
    assert.equal(safe.good, true);
    assert.equal(safe.noGoodMove, false);
  });
  it('«Не верю» сильной ставке неверно, когда безопасное повышение есть', () => {
    const s = { bid: { q: 3, f: 6 }, total: 20, hand: [6, 6, 6, 1, 2], wild: true, threshold: 0.5, probBid };
    const r = gradeMove({ ...s, choice: { type: 'dudo' } });
    assert.equal(r.good, false);
    assert.equal(r.best.type, 'raise');
  });
});

describe('gradeMove: крайние случаи', () => {
  it('повысить нельзя — единственный ход «Не верю» и он верен', () => {
    const r = gradeMove({ bid: { q: 5, f: 1 }, total: 5, hand: [2, 3], wild: true, threshold: 0.5, probBid, choice: { type: 'dudo' } });
    assert.equal(r.good, true);
    assert.equal(r.best.type, 'dudo');
  });
  it('без функции вероятности — ошибка', () => {
    assert.throws(() => gradeMove({ bid: { q: 1, f: 2 }, total: 5, hand: [], choice: { type: 'dudo' } }), TypeError);
  });
  it('Палифико: повышает только количество той же цифры', () => {
    const r = bestChanceRaise({ q: 3, f: 4 }, 12, [4, 4], false, probBid);
    assert.equal(r.f, 4);
    assert.ok(r.q > 3);
  });
  it('нет допустимых повышений — null', () => {
    assert.equal(bestChanceRaise({ q: 5, f: 1 }, 5, [], true, probBid), null);
  });
});

describe('тексты', () => {
  it('заголовок: обычный расклад и расклад без хода по порогу', () => {
    assert.equal(gradeVerdictText(true, false), VERDICT_GOOD);
    assert.equal(gradeVerdictText(false, false), VERDICT_BAD);
    assert.equal(gradeVerdictText(true, true), VERDICT_BEST_OF_BAD);
    assert.equal(gradeVerdictText(false, true), VERDICT_WORSE);
  });
  it('строка «верным был бы…»', () => {
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    const bid = (q, f) => `${q}×${f}`;
    assert.match(correctMoveText({ type: 'dudo', success: 0.6 }, pct, bid), /«Не верю».*60\.0%/);
    assert.match(correctMoveText({ type: 'raise', q: 4, f: 1, success: 0.468 }, pct, bid), /4×1.*46\.8%/);
  });
  it('без запрещённых слов', () => {
    for (const t of [VERDICT_BEST_OF_BAD, VERDICT_WORSE, NO_GOOD_NOTE]) assert.doesNotMatch(t, /обманщик|врёт|блеф|гарантир|всегда/i);
  });
});
