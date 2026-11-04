// src/repeat_text.js — тексты про повтор ситуаций в Тренажёре: причина и прогресс ← чистая логика (без DOM)

/** Сколько успешных повторов подряд нужно, чтобы ситуация ушла из очереди. */
export const REPEAT_GOAL = 2;

const streakOf = (item) => {
  const s = item && Number.isInteger(item.streak) ? item.streak : 0;
  return Math.max(0, Math.min(s, REPEAT_GOAL));
};

/** «1 из 2 успешных повторов». */
export function repeatProgress(item) {
  return `${streakOf(item)} из ${REPEAT_GOAL} успешных повторов`;
}

/** Текст значка на ситуации-повторе. */
export function repeatChipText(item) {
  return `🔁 повтор · ${repeatProgress(item)}`;
}

/** Почему ситуация вернулась и когда она уйдёт из очереди. */
export function repeatReason() {
  return 'Ситуация вернулась, потому что раньше решение в ней было неудачным. ' +
    `Она уйдёт из очереди после ${REPEAT_GOAL} успешных повторов подряд.`;
}

/** Что произошло с ситуацией после ответа; item — запись очереди уже с обновлённым streak. */
export function repeatAfterText(item, good) {
  const s = streakOf(item);
  if (good && s >= REPEAT_GOAL) return 'Ситуация освоена и убрана из очереди повторов.';
  if (good) return `Успешный повтор: ${repeatProgress(item)}. Ещё ${REPEAT_GOAL - s}, и ситуация уйдёт из очереди.`;
  return `Счёт повторов сброшен: 0 из ${REPEAT_GOAL}. Ситуация останется в очереди.`;
}
