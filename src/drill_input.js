// src/drill_input.js — разбор ответов в «Упражнениях» (без DOM).
// Пустой или нечисловой ответ — не попытка: в статистику он не попадает.

const clean = (v) => String(v ?? '').trim().replace(',', '.');

/** Десятичное число («5», «5.3», «5,3») или null. */
export function parseDecimal(v) {
  const s = clean(v);
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Целое неотрицательное число или null. */
export function parseWhole(v) {
  const s = clean(v);
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** «Оценка в уме»: ожидание (можно с дробью) и безопасная ставка (целое). */
export function validateAnswerA(v1, v2) {
  if (clean(v1) === '' || clean(v2) === '') return { ok: false, message: 'Введите оба ответа.' };
  const a1 = parseDecimal(v1);
  if (a1 === null) return { ok: false, message: 'Ожидание — число, например 5.3.' };
  const a2 = parseWhole(v2);
  if (a2 === null) return { ok: false, message: 'Безопасная ставка — целое число кубиков.' };
  return { ok: true, a1, a2 };
}

/** «Правило единиц»: целое количество. */
export function validateAnswerB(v) {
  if (clean(v) === '') return { ok: false, message: 'Введите число.' };
  const a = parseWhole(v);
  if (a === null) return { ok: false, message: 'Нужно целое число кубиков.' };
  return { ok: true, a };
}
