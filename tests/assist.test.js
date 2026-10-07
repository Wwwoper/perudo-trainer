// assist.test.js — тесты для assist.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAssistConfig, AssistMode, getAdviceText, getClassification } from '../src/assist.js';

describe('AssistMode — константы', () => {
  it('определены все режимы', () => {
    assert.strictEqual(AssistMode.NOVICE, 'novice');
    assert.strictEqual(AssistMode.TRAINING, 'training');
    assert.strictEqual(AssistMode.GAME, 'game');
  });
});

describe('createAssistConfig — Новичок', () => {
  it('показывает все подсказки', () => {
    const config = createAssistConfig(AssistMode.NOVICE);
    assert.strictEqual(config.showCurrentBidOdds, true);
    assert.strictEqual(config.showDirectAdvice, true);
    assert.strictEqual(config.showRuleExplanations, 'always');
  });
});

describe('createAssistConfig — Игра', () => {
  it('скрывает все стратегические подсказки', () => {
    const config = createAssistConfig(AssistMode.GAME);
    assert.strictEqual(config.showCurrentBidOdds, false);
    assert.strictEqual(config.showDirectAdvice, false);
    assert.strictEqual(config.showBestSafeRaise, false);
    assert.strictEqual(config.showRuleExplanations, 'off');
  });
});

describe('getAdviceText', () => {
  it('рекомендует Dudo при низкой вероятности', () => {
    const text = getAdviceText({ type: 'dudo' }, 0.3);
    assert.ok(text.includes('Не верю'));
  });
  it('оценивает ставку как надёжную', () => {
    const text = getAdviceText({ type: 'raise' }, 0.6);
    assert.ok(text.includes('Надёжная'));
  });
});

describe('getClassification', () => {
  it('Dudo с низкой вероятностью — good', () => {
    const r = getClassification(0.3, 'dudo');
    assert.strictEqual(r.code, 'good');
  });
  it('Raise с высокой вероятностью — good', () => {
    const r = getClassification(0.6, 'raise');
    assert.strictEqual(r.code, 'good');
  });
});
