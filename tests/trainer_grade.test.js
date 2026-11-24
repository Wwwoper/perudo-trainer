// trainer_grade.test.js — единое правило верного ответа Тренажёра.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gradeMove, bestChanceRaise, applyTrainerRule } from '../src/trainer_grade.js';
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

import { optionsNote, TASK_TEXT } from '../src/trainer_text.js';
describe('подсказка и задача', () => {
  const dudo = { type: 'dudo', meetsThreshold: false };
  const raise = { type: 'minRaise', meetsThreshold: false };
  it('согласована с оценкой во всех трёх случаях', () => {
    assert.equal(optionsNote([dudo, { ...raise, meetsThreshold: true }]), '');
    assert.match(optionsNote([{ ...dudo, meetsThreshold: true }, raise]), /верно «Не верю»/);
    assert.match(optionsNote([dudo, raise]), /наибольшим шансом/);
    assert.match(optionsNote([]), /Ни один ход/);
  });
  it('текст задачи называет оба хода и правило без хода по порогу', () => {
    assert.match(TASK_TEXT, /повысить/);
    assert.match(TASK_TEXT, /«Не верю»/);
    assert.match(TASK_TEXT, /наибольшим шансом/);
  });
});

describe('gradeMove: единое правило «шанс успеха выше порога»', () => {
  // ставка 15×4 при 20 кубиках: «Не верю» сработает почти наверняка
  const S = { bid: { q: 15, f: 4 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, probBid };

  it('шанс ровно на пороге его не проходит, на пункт выше — проходит', () => {
    const fake = (p) => () => p;
    const at = (p, thr) => gradeMove({ bid: { q: 5, f: 3 }, total: 10, hand: [3], wild: true, threshold: thr, probBid: fake(p), choice: { type: 'dudo' } });
    // успех «Не верю» = 1 − шанс ставки: ставка 0,5 → 50% ровно на пороге 0,5
    assert.equal(at(0.5, 0.5).best.success, 0.5);
    assert.equal(at(0.5, 0.5).noGoodMove, true);
    assert.equal(at(0.49, 0.5).noGoodMove, false);   // успех 51%
    assert.equal(at(0.49, 0.5).good, true);
  });

  it('«Не верю» оценивается своим шансом успеха и при пороге выше 50%', () => {
    const pBid = probBid(15, 4, 20, S.hand, true);
    const success = Math.round((1 - pBid) * 100);
    const below = (success - 5) / 100, above = (success + 5) / 100;
    assert.equal(gradeMove({ ...S, threshold: below, choice: { type: 'dudo' } }).good, true);
    const r = gradeMove({ ...S, threshold: above, choice: { type: 'dudo' } });
    // если выше порога успеха «Не верю» ничего нет, это «нет проходящего хода», а не лёгкое «верно»
    assert.equal(r.noGoodMove || r.best.type === 'raise', true);
  });

  it('повышение: проходит шанс выше порога по округлённому проценту', () => {
    const s = { bid: { q: 3, f: 6 }, total: 20, hand: [6, 6, 6, 1, 2], wild: true, probBid };
    const p = probBid(4, 6, 20, s.hand, true);
    const r = Math.round(p * 100);
    assert.equal(gradeMove({ ...s, threshold: (r - 1) / 100, choice: { type: 'raise', q: 4, f: 6 } }).good, true);
    const onThreshold = gradeMove({ ...s, threshold: r / 100, choice: { type: 'raise', q: 4, f: 6 } });
    assert.equal(onThreshold.chosenSuccess, p);
    // ровно на пороге повышение не проходит: верным остаётся либо другой ход, либо «лучший из плохих»
    assert.equal(onThreshold.good === false || onThreshold.noGoodMove, true);
  });
});

describe('applyTrainerRule', () => {
  it('«проходит порог» по шансу успеха для всех вариантов, исходные поля сохраняются', () => {
    const opts = [
      { type: 'dudo', p: 0.3, success: 0.7, meetsThreshold: true },
      { type: 'minRaise', q: 4, f: 5, p: 0.5, success: 0.5, meetsThreshold: true },
      { type: 'safeRaise', q: 5, f: 5, p: 0.52, success: 0.52, meetsThreshold: false },
    ];
    const r = applyTrainerRule(opts, 0.5);
    assert.deepEqual(r.map((o) => o.meetsThreshold), [true, false, true]);
    assert.equal(r[1].q, 4);
    assert.equal(opts[1].meetsThreshold, true, 'исходный список не меняется');
  });
  it('у «Не верю» при пороге 0,65 шанс проверки 70% проходит, а шанс 0,6 — нет', () => {
    const r = applyTrainerRule([{ type: 'dudo', p: 0.3, success: 0.7 }, { type: 'dudo', p: 0.4, success: 0.6 }], 0.65);
    assert.deepEqual(r.map((o) => o.meetsThreshold), [true, false]);
  });
});
