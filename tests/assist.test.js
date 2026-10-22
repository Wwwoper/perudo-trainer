// assist.test.js — тесты для assist.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAssistConfig, AssistMode, getAdviceText, getClassification, SOFTEN_FROM } from '../src/assist.js';

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

describe('getClassification: смягчение по ставкам за столом', () => {
  it('без probRead пороги прежние: 0.5 / 0.35', () => {
    assert.strictEqual(getClassification(0.5, 'raise').code, 'good');
    assert.strictEqual(getClassification(0.35, 'raise').code, 'meh');
    assert.strictEqual(getClassification(0.096, 'raise').code, 'bad');
  });
  it('слабая ставка + шанс с учётом стола не ниже порога → «Рискованная», softened', () => {
    const r = getClassification(0.096, 'raise', 0.43);
    assert.strictEqual(r.code, 'meh');
    assert.strictEqual(r.label, 'Рискованная ставка');
    assert.strictEqual(r.softened, true);
    assert.strictEqual(getClassification(0.096, 'raise', SOFTEN_FROM).code, 'meh');
  });
  it('шанс с учётом стола ниже порога или не число — остаётся «Слабая»', () => {
    assert.strictEqual(getClassification(0.096, 'raise', 0.34).code, 'bad');
    assert.strictEqual(getClassification(0.096, 'raise', NaN).code, 'bad');
    assert.strictEqual(getClassification(0.096, 'raise', undefined).code, 'bad');
  });
  it('good и meh по своим кубикам не меняются и не помечаются softened', () => {
    assert.strictEqual(getClassification(0.6, 'raise', 0.9).softened, undefined);
    assert.strictEqual(getClassification(0.4, 'raise', 0.9).softened, undefined);
  });
  it('«Не верю» и Calza не смягчаются', () => {
    assert.strictEqual(getClassification(0.7, 'dudo', 0.1).code, 'bad');
    assert.strictEqual(getClassification(0.1, 'calza', 0.9).code, 'bad');
  });
});
