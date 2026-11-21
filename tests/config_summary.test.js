// config_summary.test.js — строка под «Начать партию».
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { configSummary, plural, rulesText, SUMMARY_PREFIX } from '../src/config_summary.js';

describe('plural', () => {
  it('склоняет кубики и ботов', () => {
    const k = ['кубик', 'кубика', 'кубиков'];
    assert.deepStrictEqual([1, 2, 4, 5, 10, 11, 12, 14, 21, 22, 25].map((n) => plural(n, k)),
      ['кубик', 'кубика', 'кубика', 'кубиков', 'кубиков', 'кубиков', 'кубиков', 'кубиков', 'кубик', 'кубика', 'кубиков']);
  });
});

describe('rulesText', () => {
  it('четыре сочетания правил', () => {
    assert.strictEqual(rulesText(false, false), 'без Calza и Палифико');
    assert.strictEqual(rulesText(true, false), 'только Calza');
    assert.strictEqual(rulesText(false, true), 'только Палифико');
    assert.strictEqual(rulesText(true, true), 'Calza и Палифико');
  });
});

describe('SUMMARY_PREFIX', () => {
  it('честно говорит, что показаны не все параметры', () => {
    assert.strictEqual(SUMMARY_PREFIX, 'Кратко (не все параметры): ');
  });
});

describe('configSummary', () => {
  it('полная строка по умолчанию', () => {
    assert.strictEqual(configSummary({ dice: '5', bots: '3', assist: 'training', speed: 'normal', calza: false, palifico: false }),
      '5 кубиков · 3 бота · Тренировка · Нормально · без Calza и Палифико');
  });
  it('другие значения', () => {
    assert.strictEqual(configSummary({ dice: 1, bots: 1, assist: 'game', speed: 'step', calza: true, palifico: true }),
      '1 кубик · 1 бот · Игра · Пошагово · Calza и Палифико');
    assert.strictEqual(configSummary({ dice: 3, bots: 5, assist: 'novice', speed: 'fast', calza: true, palifico: false }),
      '3 кубика · 5 ботов · Новичок · Быстро · только Calza');
  });
  it('пустые и неизвестные значения заменяются стандартными', () => {
    assert.strictEqual(configSummary({ dice: '', bots: undefined, assist: 'x', speed: undefined }),
      '5 кубиков · 3 бота · Тренировка · Нормально · без Calza и Палифико');
  });
});
