// trainer_text.js — подписи вердикта в Тренажёре. Чистый модуль: без DOM.
//
// Оценка «хорошее / сомнительное» считается по шансу ставки при ваших кубиках и порогу, а не по выигрышу партии:
// решение с высоким шансом иногда проигрывает, и наоборот. Поэтому в подписи есть «по шансу», а под ней оговорка.

export const VERDICT_GOOD = '✓ Хорошее решение по шансу';
export const VERDICT_BAD = '✗ Сомнительное решение по шансу';

export const MODEL_NOTE = 'Оценка по шансу ставки и порогу, а не по выигрышу партии: хорошее по расчёту решение иногда проигрывает.';

/** Заголовок вердикта. */
export function verdictText(good) {
  return good ? VERDICT_GOOD : VERDICT_BAD;
}

// Ситуация, где ни один ход не проходит порог: верным считается ход с наибольшим шансом успеха.
export const VERDICT_BEST_OF_BAD = '✓ Лучший из имеющихся ходов';
export const VERDICT_WORSE = '✗ Был ход лучше';
export const NO_GOOD_NOTE = 'В этом раскладе ни один ход не проходит порог. Верным считается ход с наибольшим шансом успеха.';

/** Заголовок вердикта с учётом того, был ли в раскладе ход, проходящий порог. */
export function gradeVerdictText(good, noGoodMove) {
  if (!noGoodMove) return verdictText(good);
  return good ? VERDICT_BEST_OF_BAD : VERDICT_WORSE;
}

/** Строка «верным был бы…» для неверного ответа; bid — функция, рисующая ставку (текст или html). */
export function correctMoveText(best, pct, bid) {
  if (best.type === 'dudo') return `Верным был бы «Не верю»: проверка сработает с шансом ${pct(best.success)}.`;
  return `Верным было бы повышение ${bid(best.q, best.f)}: ваша ставка верна с шансом ${pct(best.success)}.`;
}

export const TASK_QUESTION = 'Верить ставке соперника и повысить или сказать «Не верю»?';
export const TASK_RULE = 'Верен ход, проходящий порог шанса; если такого хода нет, верен ход с наибольшим шансом успеха.';
export const TASK_TEXT = `${TASK_QUESTION} ${TASK_RULE}`;

/** Шанс для разбора хода: «6,2 %», «50 %» (без лишнего «.0» и с запятой). */
export function chanceText(x) {
  if (!Number.isFinite(x)) return '—';
  const v = Math.round(Math.min(1, Math.max(0, x)) * 1000) / 10;
  return `${String(v).replace('.', ',')} %`;
}

/**
 * Разбор хода по частям: шансы (ваш ход и ставка соперника) и одно предложение «почему».
 * kind 'raise': p — шанс вашей ставки, po — шанс ставки соперника.
 * kind 'dudo': po — шанс ставки соперника, шанс вашего хода — что проверка сработает (1 − po).
 * @returns {{mine: {chance: number, passes: boolean}, opp: {chance: number}, why: string}}
 */
export function moveBreakdown({ kind, p, po, t, good, noGoodMove }) {
  const mineChance = kind === 'dudo' ? 1 - po : p;
  const T = chanceText(t);
  const c = chanceText(mineChance);
  let why;
  if (noGoodMove) {
    why = good ? `Ни один ход не проходит порог ${T}; этот даёт наибольший шанс успеха.`
      : `Ни один ход не проходит порог ${T}, но был ход с большим шансом успеха.`;
  } else if (kind === 'dudo') {
    why = `«Не верю» сработает с шансом ${c}: это ${good ? 'не ниже' : 'ниже'} порога ${T}.`;
  } else {
    why = `Шанс вашей ставки ${c} ${good ? 'не ниже' : 'ниже'} порога ${T}.`;
  }
  return { mine: { chance: mineChance, passes: mineChance >= t }, opp: { chance: po }, why };
}

/** Пояснение под списком вариантов: согласовано с оценкой; пусто, если есть безопасное повышение. */
export function optionsNote(options) {
  if (options.some((o) => o.type !== 'dudo' && o.meetsThreshold)) return '';
  if (options.some((o) => o.type === 'dudo' && o.meetsThreshold)) {
    return 'Безопасных повышений выше порога нет, зато ставка соперника верна реже порога: здесь верно «Не верю».';
  }
  return 'Ни один ход не проходит порог. Верным считается ход с наибольшим шансом успеха.';
}
