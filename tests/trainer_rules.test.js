// trainer_rules.test.js — проверка ставки игрока в тренажёре по правилам.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkRaise, defaultRaise } from '../src/trainer_rules.js';
import { legal } from '../src/rules.js';

const classic = { wild: true };
const nowild = { wild: false };
const sit = (n, q, f, m) => ({ n, q, f, m });

describe('checkRaise', () => {
  const table = [
    ['4×1 → 6×4 classic', sit(14, 4, 1, classic), 6, 4, false],
    ['4×1 → 9×4 classic', sit(14, 4, 1, classic), 9, 4, true],
    ['4×1 → 5×1 classic', sit(14, 4, 1, classic), 5, 1, true],
    ['6×5 → 3×1 classic', sit(14, 6, 5, classic), 3, 1, true],
    ['6×5 → 2×1 classic', sit(14, 6, 5, classic), 2, 1, false],
    ['4×3 → 2×3 classic', sit(14, 4, 3, classic), 2, 3, false],
    ['4×3 → 5×4 nowild', sit(14, 4, 3, nowild), 5, 4, false],
    ['4×3 → 5×3 nowild', sit(14, 4, 3, nowild), 5, 3, true],
    ['та же ставка', sit(14, 4, 3, classic), 4, 3, false],
  ];
  for (const [name, cur, Q, F, ok] of table) {
    it(name, () => assert.strictEqual(checkRaise(Q, F, cur).ok, ok));
  }

  it('сообщение называет минимальную ставку на выбранную цифру', () => {
    const r = checkRaise(6, 4, sit(14, 4, 1, classic));
    assert.match(r.message, /не меньше 9×4/);
  });

  it('в режиме без джокеров на другую цифру ставить нельзя', () => {
    const r = checkRaise(5, 4, sit(14, 4, 3, nowild));
    assert.match(r.message, /нельзя/);
    assert.match(r.message, /только количество/);
  });

  it('ставка больше числа кубиков отклоняется', () => {
    const r = checkRaise(15, 6, sit(14, 4, 3, classic));
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /больше общего/);
  });

  it('нечисловые значения отклоняются', () => {
    assert.strictEqual(checkRaise(NaN, 3, sit(14, 4, 3, classic)).ok, false);
    assert.strictEqual(checkRaise(5, 0, sit(14, 4, 3, classic)).ok, false);
  });
});

describe('defaultRaise', () => {
  it('для 1000 случайных ситуаций значение по умолчанию допустимо', () => {
    for (const m of [classic, nowild]) {
      for (let i = 0; i < 500; i++) {
        const n = 3 + Math.floor(Math.random() * 38);
        const q = 1 + Math.floor(Math.random() * n);
        const f = 1 + Math.floor(Math.random() * 6);
        const cur = sit(n, q, f, m);
        const d = defaultRaise(cur);
        if (d) {
          assert.ok(legal(d.q, d.f, { q, f }, m), `${q}×${f} → ${d.q}×${d.f}`);
          assert.ok(checkRaise(d.q, d.f, cur).ok);
        }
      }
    }
  });

  it('если повысить нельзя — null', () => {
    assert.strictEqual(defaultRaise(sit(5, 5, 3, nowild)), null);
  });
});
