// drill_input.test.js — разбор ответов в «Упражнениях».
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseDecimal, parseWhole, validateAnswerA, validateAnswerB } from '../src/drill_input.js';

describe('parseDecimal / parseWhole', () => {
  it('десятичное: точка и запятая, пробелы по краям', () => {
    assert.strictEqual(parseDecimal('5.3'), 5.3);
    assert.strictEqual(parseDecimal(' 6,3 '), 6.3);
    assert.strictEqual(parseDecimal('6'), 6);
  });
  it('десятичное: мусор и пустое — null', () => {
    for (const v of ['', '  ', 'abc', '5.', '.5', '-1', '1e3', null, undefined]) assert.strictEqual(parseDecimal(v), null, String(v));
  });
  it('целое: дробь, минус и мусор — null', () => {
    assert.strictEqual(parseWhole('7'), 7);
    assert.strictEqual(parseWhole('0'), 0);
    for (const v of ['5.4', '5,4', '-1', 'x', '', '5 6']) assert.strictEqual(parseWhole(v), null, v);
  });
});

describe('validateAnswerA', () => {
  it('оба поля пустые или одно пустое — сообщение', () => {
    assert.deepStrictEqual(validateAnswerA('', ''), { ok: false, message: 'Введите оба ответа.' });
    assert.strictEqual(validateAnswerA('5', '').ok, false);
    assert.strictEqual(validateAnswerA('', '5').ok, false);
  });
  it('дробная безопасная ставка отклоняется, дробное ожидание — нет', () => {
    assert.strictEqual(validateAnswerA('5.3', '5.4').ok, false);
    assert.deepStrictEqual(validateAnswerA('5,3', '5'), { ok: true, a1: 5.3, a2: 5 });
  });
  it('ноль — допустимый ответ', () => {
    assert.deepStrictEqual(validateAnswerA('0', '0'), { ok: true, a1: 0, a2: 0 });
  });
  it('не число в ожидании', () => {
    assert.strictEqual(validateAnswerA('abc', '5').ok, false);
  });
});

describe('validateAnswerB', () => {
  it('пустое — сообщение', () => {
    assert.deepStrictEqual(validateAnswerB(''), { ok: false, message: 'Введите число.' });
  });
  it('дробь отклоняется (раньше parseInt(«5.7») давал 5)', () => {
    assert.strictEqual(validateAnswerB('5.7').ok, false);
  });
  it('целое принимается', () => {
    assert.deepStrictEqual(validateAnswerB('9'), { ok: true, a: 9 });
  });
});
