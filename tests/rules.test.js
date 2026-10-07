// rules.test.js — тесты для rules.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { legal, minLegal, onesDown, onesUp } from '../src/rules.js';

describe('legal', () => {
  it('первая ставка: любая цифра кроме единиц', () => {
    assert.strictEqual(legal(5, 3, null, { wild: true }), true);
    assert.strictEqual(legal(5, 1, null, { wild: true }), false);
  });
  it('повышение обычной цифры', () => {
    const bid = { q: 7, f: 4 };
    assert.strictEqual(legal(8, 4, bid, { wild: true }), true);
    assert.strictEqual(legal(7, 4, bid, { wild: true }), false);
  });
  it('переход на единицы', () => {
    const bid = { q: 9, f: 4 };
    assert.strictEqual(legal(5, 1, bid, { wild: true }), true);
  });
  it('Palifico: только количество', () => {
    const bid = { q: 4, f: 3 };
    assert.strictEqual(legal(5, 3, bid, { wild: false }), true);
    assert.strictEqual(legal(4, 4, bid, { wild: false }), false);
  });
});

describe('minLegal', () => {
  it('первая ставка: 1×2', () => {
    assert.deepStrictEqual(minLegal(null, 20, { wild: true }), { q: 1, f: 2 });
  });
  it('после 7×4: 4×1', () => {
    assert.deepStrictEqual(minLegal({ q: 7, f: 4 }, 20, { wild: true }), { q: 4, f: 1 });
  });
  it('в Palifico после 4×3: 5×3', () => {
    assert.deepStrictEqual(minLegal({ q: 4, f: 3 }, 20, { wild: false }), { q: 5, f: 3 });
  });
});

describe('onesDown', () => {
  it('9 → 5', () => { assert.strictEqual(onesDown(9), 5); });
  it('10 → 5', () => { assert.strictEqual(onesDown(10), 5); });
});

describe('onesUp', () => {
  it('5 → 11', () => { assert.strictEqual(onesUp(5), 11); });
  it('3 → 7', () => { assert.strictEqual(onesUp(3), 7); });
});
