// assist.test.js — тесты для assist.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAssistConfig, AssistMode, getAdviceText, getClassification, SOFTEN_FROM, effectiveExplain } from '../src/assist.js';

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
    assert.strictEqual(config.explain, 'full');
  });
});

describe('createAssistConfig — Игра', () => {
  it('скрывает все стратегические подсказки', () => {
    const config = createAssistConfig(AssistMode.GAME);
    assert.strictEqual(config.showCurrentBidOdds, false);
    assert.strictEqual(config.showDirectAdvice, false);
    assert.strictEqual(config.showBestSafeRaise, false);
    assert.strictEqual(config.explain, 'off');
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

describe('createAssistConfig — убранные флаги', () => {
  it('неиспользуемых флагов в конфигурации нет', () => {
    for (const mode of Object.values(AssistMode)) {
      const c = createAssistConfig(mode);
      for (const dead of ['showOpponentReasoning', 'showRuleExplanations', 'reviewTiming']) assert.ok(!(dead in c), `${mode}: ${dead}`);
    }
  });
  it('у Тренировки объяснения после хода', () => {
    assert.strictEqual(createAssistConfig(AssistMode.TRAINING).explain, 'after');
  });
});

describe('effectiveExplain: 3 режима × 4 значения', () => {
  const table = {
    novice: { auto: 'full', off: 'off', after: 'after', full: 'full' },
    training: { auto: 'after', off: 'off', after: 'after', full: 'full' },
    game: { auto: 'off', off: 'off', after: 'after', full: 'full' },
  };
  for (const [mode, row] of Object.entries(table)) {
    for (const [explain, want] of Object.entries(row)) {
      it(`${mode} + ${explain} → ${want}`, () => assert.strictEqual(effectiveExplain(mode, explain), want));
    }
  }
  it('мусор: неизвестное значение — как «авто», неизвестный режим — как Тренировка', () => {
    assert.strictEqual(effectiveExplain('training', 'всё'), 'after');
    assert.strictEqual(effectiveExplain('нет', 'auto'), 'after');
    assert.strictEqual(effectiveExplain(undefined, undefined), 'after');
    assert.strictEqual(effectiveExplain('novice', null), 'full');
  });
});
