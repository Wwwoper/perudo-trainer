// src/practice_timer.js — необязательный таймер в Тренажёре и Упражнениях ← чистая логика (без DOM и хранилища).
//
// Таймер только показывает, сколько прошло времени с появления задачи. Он считает вверх, без лимита, не останавливает
// и не отклоняет ответ и нигде не учитывается: ни в оценке, ни в статистике.

export const TIMER_LABEL = 'Показывать время';
export const TIMER_NOTE = 'Время только для вас: оно не влияет на оценку и не попадает в статистику.';
/** Показ дольше этого значения не растёт (99 минут 59 секунд). */
export const MAX_SHOWN_MS = (99 * 60 + 59) * 1000;

/** Допустимое значение настройки: только true включает таймер. */
export function sanitizeTimerPref(raw) {
  return raw === true;
}

/** «м:сс» для прошедшего времени в миллисекундах; мусор и отрицательные значения → «0:00». */
export function formatElapsed(ms) {
  const n = Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_SHOWN_MS) : 0;
  const total = Math.floor(n / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Секундомер с подменяемыми часами. start — начать заново, stop — остановить (значение сохраняется),
 * elapsed — прошедшее время, running — идёт ли отсчёт.
 */
export function createStopwatch(now = () => Date.now()) {
  let startedAt = null;
  let stoppedAt = null;
  return {
    start() { startedAt = now(); stoppedAt = null; },
    stop() { if (startedAt !== null && stoppedAt === null) stoppedAt = now(); },
    reset() { startedAt = null; stoppedAt = null; },
    running() { return startedAt !== null && stoppedAt === null; },
    elapsed() {
      if (startedAt === null) return 0;
      return Math.max(0, (stoppedAt ?? now()) - startedAt);
    },
  };
}
