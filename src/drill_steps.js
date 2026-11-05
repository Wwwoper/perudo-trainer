// src/drill_steps.js — ступени «Упражнений»: разобранный пример → частично решённая задача → самостоятельно.
// Чистая логика (без DOM). Ступень зависит только от числа уже сделанных попыток в этом упражнении.

/** Сколько попыток в «Оценке в уме» идёт с подсказанным первым числом. */
export const PARTIAL_ATTEMPTS = 2;

export const STEP_EXAMPLE = 'example';
export const STEP_PARTIAL = 'partial';
export const STEP_SOLO = 'solo';

const count = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * Ступень для упражнения.
 * @param {'A'|'B'|string} kind A — «Оценка в уме» (три ступени), остальные — две (пример и самостоятельно)
 * @param {number} done сколько попыток уже записано
 */
export function drillStep(kind, done) {
  const n = count(done);
  if (n === 0) return STEP_EXAMPLE;
  if (kind === 'A' && n <= PARTIAL_ATTEMPTS) return STEP_PARTIAL;
  return STEP_SOLO;
}

/** Памятка раскрыта только на первой ступени. */
export const hintOpenFor = (step) => step === STEP_EXAMPLE;

const NOTES = Object.freeze({
  A: Object.freeze({
    [STEP_EXAMPLE]: 'Первая задача: сначала разберите пример в памятке «Как прикинуть в уме», потом решите сами.',
    [STEP_PARTIAL]: 'Первое число уже подставлено: проверьте его и найдите безопасную ставку сами.',
    [STEP_SOLO]: '',
  }),
  B: Object.freeze({
    [STEP_EXAMPLE]: 'Первая задача: сначала посмотрите правило в памятке «Как это посчитать», потом решите сами.',
    [STEP_PARTIAL]: '',
    [STEP_SOLO]: '',
  }),
});

/** Строка-пояснение над полями ответа; пустая, когда подсказок уже нет. */
export function stepNote(kind, step) {
  return NOTES[kind]?.[step] ?? '';
}

/** Первое число для ступени «частично»: точное ожидание с одним знаком после запятой. */
export function prefillExpected(own, unknown, face) {
  const p = face === 1 ? 1 / 6 : 1 / 3;
  return (own + unknown * p).toFixed(1);
}
