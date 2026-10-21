// tests/drill_rule.test.js — правило «ожидание → безопасная ставка» против точного расчёта из core.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chanceDen, expected, isHalfway, safeByRule } from '../src/drill_rule.js';

// core.js — классический скрипт, грузим так же, как в core.test.cjs
const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(here, '../src/core.js'), 'utf8'), sandbox, { filename: 'core.js' });
const P = sandbox.self.Perudo;

describe('шанс и ожидание', () => {
  it('1/3 для обычной цифры, 1/6 для единиц', () => {
    assert.equal(chanceDen(2), 3);
    assert.equal(chanceDen(6), 3);
    assert.equal(chanceDen(1), 6);
  });
  it('пример из подсказки: 3 своих и 10 чужих на тройки — 6,3', () => {
    assert.ok(Math.abs(expected(3, 10, 3) - 6.3333) < 1e-3);
    assert.equal(safeByRule(3, 10, 3), 6);
  });
  it('мусор вместо чисел считается нулями', () => {
    assert.equal(safeByRule(-2, 'x', 3), 0);
    assert.equal(expected(undefined, null, 2), 0);
  });
});

describe('округление: к ближайшему, ровно посередине — вниз', () => {
  it('6,3 → 6; 6,7 → 7; 6,5 → 6', () => {
    assert.equal(safeByRule(0, 19, 3), 6);       // 19/3 = 6,33
    assert.equal(safeByRule(0, 20, 3), 7);       // 20/3 = 6,67
    assert.equal(safeByRule(0, 39, 1), 6);       // грань 1, 39/6 = 6,5 — посередине
    assert.equal(isHalfway(0, 39, 1), true);
    assert.equal(isHalfway(0, 20, 3), false);
  });
  it('целое ожидание не меняется', () => {
    assert.equal(safeByRule(2, 9, 3), 5);
    assert.equal(isHalfway(2, 9, 3), false);
  });
  it('без чужих кубиков ставка — свои', () => {
    assert.equal(safeByRule(4, 0, 3), 4);
    assert.equal(safeByRule(0, 0, 1), 0);
  });
});

describe('правило совпадает с точным расчётом приложения (bestBid, порог 50%)', () => {
  // Свои кубики — это own штук нужной грани; чужих unk. Ставка считается так же, как в упражнении.
  for (const face of [1, 2, 3, 4, 5, 6]) {
    it(`грань ${face}: свои 0–6, чужих 0–60`, () => {
      const bad = [];
      for (let own = 0; own <= 6; own++) {
        for (let unk = 0; unk <= 60; unk++) {
          const hand = Array(own).fill(face);
          const exact = P.bestBid(face, own + unk, hand, true, 0.5);
          // при нулевом столе bestBid ищет q от 1: ставка 0 — «ставить нечего»
          const rule = safeByRule(own, unk, face);
          if (exact !== rule && !(own + unk === 0)) bad.push({ own, unk, exact, rule });
        }
      }
      assert.deepEqual(bad.slice(0, 5), []);
    });
  }
});
