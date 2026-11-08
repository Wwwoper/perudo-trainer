// trainer_solvable.test.js — ситуации Тренажёра без безвыходности.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hasGoodMove, pickSolvable } from '../src/trainer_solvable.js';

const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'), sandbox, { filename: 'core.js' });
const P = sandbox.self.Perudo;
const probBid = (...a) => P.probBid(...a);

describe('hasGoodMove', () => {
  it('ситуация из обращения (8×3 против руки 1,2,3,3,6): ни один ход не проходит порог 0,5', () => {
    assert.equal(hasGoodMove({ bid: { q: 8, f: 3 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, threshold: 0.5, probBid }), false);
  });
  it('слабая ставка соперника: «Не верю» проходит порог', () => {
    assert.equal(hasGoodMove({ bid: { q: 15, f: 4 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, threshold: 0.5, probBid }), true);
  });
  it('сильная ставка соперника: проходит безопасное повышение', () => {
    // ставка 3×6 при 20 кубиках очень вероятна, повысить на 4×6 можно с шансом выше половины
    assert.equal(hasGoodMove({ bid: { q: 3, f: 6 }, total: 20, hand: [6, 6, 6, 1, 2], wild: true, threshold: 0.5, probBid }), true);
  });
  it('порог 0,5 и сохранённый результат совпадают с compareOptions: учитывает переданный порог', () => {
    const s = { bid: { q: 8, f: 3 }, total: 20, hand: [1, 2, 3, 3, 6], wild: true, probBid };
    assert.equal(hasGoodMove({ ...s, threshold: 0.65 }), true);   // 59,6% < 65%: «Не верю» уже проходит
  });
});

describe('pickSolvable', () => {
  it('возвращает первую подходящую ситуацию', () => {
    let i = 0;
    const r = pickSolvable(() => ({ id: ++i }), (s) => s.id === 3);
    assert.deepEqual(r, { id: 3 });
  });
  it('если подходящей нет, отдаёт последнюю и не зацикливается', () => {
    let i = 0;
    const r = pickSolvable(() => ({ id: ++i }), () => false, 5);
    assert.deepEqual(r, { id: 5 });
    assert.equal(i, 5);
  });
  it('первая ситуация подошла — больше не создаёт', () => {
    let i = 0;
    pickSolvable(() => ({ id: ++i }), () => true);
    assert.equal(i, 1);
  });
  it('на настоящем генераторе доля безвыходных ситуаций после отбора мала', () => {
    const make = () => {
      const n = P.ri(15, 25), h = P.roll(5), f = P.ri(1, 6);
      let q = Math.round(n * P.pFace(f, true) + P.ri(-2, 3));
      q = Math.max(1, Math.min(n, q));
      return { n, h, f, q };
    };
    const ok = (s) => hasGoodMove({ bid: { q: s.q, f: s.f }, total: s.n, hand: s.h, wild: true, threshold: 0.5, probBid });
    let bad = 0;
    for (let i = 0; i < 300; i++) if (!ok(pickSolvable(make, ok))) bad++;
    assert.ok(bad <= 3, `безвыходных после отбора: ${bad}`);
  });
});
