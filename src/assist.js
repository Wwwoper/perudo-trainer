// assist.js — режимы помощи (Новичок / Тренировка / Игра)

export const AssistMode = {
  NOVICE: 'novice',
  TRAINING: 'training',
  GAME: 'game',
};

export function createAssistConfig(mode = AssistMode.TRAINING) {
  switch (mode) {
    case AssistMode.NOVICE:
      return {
        showCurrentBidOdds: true,
        showFutureBidOdds: true,
        showDirectAdvice: true,
        showBestSafeRaise: false,
        showOpponentReasoning: true,
        showLegalMoveHighlight: true,
        showRuleExplanations: 'always',
        reviewTiming: 'every_turn',
      };

    case AssistMode.TRAINING:
      return {
        showCurrentBidOdds: true,
        showFutureBidOdds: true,
        showDirectAdvice: false,
        showBestSafeRaise: false,
        showOpponentReasoning: true,
        showLegalMoveHighlight: true,
        showRuleExplanations: 'on_demand',
        reviewTiming: 'end_round',
      };

    case AssistMode.GAME:
      return {
        showCurrentBidOdds: false,
        showFutureBidOdds: false,
        showDirectAdvice: false,
        showBestSafeRaise: false,
        showOpponentReasoning: false,
        showLegalMoveHighlight: true,
        showRuleExplanations: 'off',
        reviewTiming: 'manual',
      };

    default:
      throw new Error(`Unknown assist mode: ${mode}`);
  }
}

export function getAdviceText(action, probability, threshold = 0.5) {
  if (action.type === 'dudo') {
    return probability < threshold ? 'Лучше сказать «Не верю»' : 'Ставка вероятна — лучше верить';
  }
  if (probability >= 0.5) return 'Надёжная ставка';
  if (probability >= 0.35) return 'Рискованная ставка / блеф';
  return 'Слабая ставка (маловероятна)';
}

export function getClassification(probability, kind = 'raise') {
  if (kind === 'dudo') {
    if (probability < 0.5) return { code: 'good', label: 'Верная проверка', score: 1 };
    if (probability < 0.6) return { code: 'meh', label: 'Спорная проверка', score: 0.5 };
    return { code: 'bad', label: 'Зря не поверили', score: 0 };
  }
  if (probability >= 0.5) return { code: 'good', label: 'Надёжная ставка', score: 1 };
  if (probability >= 0.35) return { code: 'meh', label: 'Рискованная ставка', score: 0.5 };
  return { code: 'bad', label: 'Слабая ставка', score: 0 };
}
