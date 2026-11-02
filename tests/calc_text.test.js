import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcExplainLines } from '../src/calc_text.js';

const fmt = (x) => `${(x * 100).toFixed(1)}%`;
const BANNED = /обманщик|врёт|блеф|гарантир|точно|всегда/i;

describe('calcExplainLines', () => {
  it('две строки: шанс ставки и дополняющий шанс проверки', () => {
    assert.deepEqual(calcExplainLines(0.62, fmt), ['Ставка верна с шансом 62.0%.', '«Не верю!» сработает с шансом 38.0%.']);
  });
  it('границы 0 и 1 дают 0 % и 100 %, сумма всегда 100 %', () => {
    assert.deepEqual(calcExplainLines(0, fmt), ['Ставка верна с шансом 0.0%.', '«Не верю!» сработает с шансом 100.0%.']);
    assert.deepEqual(calcExplainLines(1, fmt), ['Ставка верна с шансом 100.0%.', '«Не верю!» сработает с шансом 0.0%.']);
    for (let i = 0; i <= 200; i++) {
      const p = i / 200;
      const [a, b] = calcExplainLines(p, fmt).map((l) => Number(l.match(/(\d+\.\d)%/)[1]));
      assert.ok(Math.abs(a + b - 100) < 0.11, `p=${p}: ${a} + ${b}`);
    }
  });
  it('мусор вместо вероятности или форматтера даёт пустой список', () => {
    for (const bad of [NaN, Infinity, -0.1, 1.1, '0.5', null, undefined, {}]) assert.deepEqual(calcExplainLines(bad, fmt), [], String(bad));
    assert.deepEqual(calcExplainLines(0.5, null), []);
  });
  it('тексты не содержат запрещённых слов и не называют результат гарантированным', () => {
    for (const l of calcExplainLines(0.37, fmt)) assert.doesNotMatch(l, BANNED);
  });
});
