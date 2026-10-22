// src/drill_note.js — пояснения к ответу в «Оценке в уме» (без DOM). Проценты передаются уже отформатированными.

/** Безопасной ставки нет (safe = 0): даже ставка 1 сбывается реже, чем в половине случаев. */
export function noSafeText(chanceOne) {
  return `Безопасной ставки нет: даже ставка 1 сбывается лишь в ${chanceOne} случаев (меньше 50%). Правильный ответ — 0.`;
}

/**
 * Пометка о риске, если ответ выше безопасной ставки; иначе пустая строка.
 * accepted — ответ принят по допуску ±1.
 */
export function riskNote({ answer, safe, chanceAnswer, chanceSafe, accepted }) {
  if (!(safe > 0 && answer > safe)) return '';
  return `Ваша ставка ${answer} ${accepted ? 'принята по допуску, но' : 'не принята:'} шанс ${chanceAnswer} — меньше 50%. ` +
    `Безопасная — ${safe} (${chanceSafe}).`;
}
