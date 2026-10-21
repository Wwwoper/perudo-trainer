// src/drill_rule.js — прикидка «в уме» для упражнения «Оценка в уме» (без DOM).
//
// Ожидание: свои + чужие × шанс, шанс 1/3 для обычной цифры (цифра и единица-джокер) и 1/6 для единиц.
// Безопасная ставка (шанс не меньше 50%): ожидание, округлённое к ближайшему целому, а ровно посередине
// (…,5) — вниз. Для 0–60 неизвестных кубиков это совпадает с точным расчётом (см. tests/drill_rule.test.js),
// поэтому отдельные правила «для большого и малого стола» не нужны.
// Дроби считаем в целых числах: на границе «ровно посередине» ошибка float дала бы лишнюю единицу.

/** Знаменатель шанса одного чужого кубика: 3 для обычной цифры, 6 для единиц. */
export const chanceDen = (face) => (face === 1 ? 6 : 3);

const nonNeg = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Ожидание как число (для показа). */
export function expected(own, unknown, face) {
  return nonNeg(own) + nonNeg(unknown) / chanceDen(face);
}

/** Дробная часть ожидания ровно 0,5: такое округляем вниз. */
export function isHalfway(own, unknown, face) {
  const den = chanceDen(face);
  return (2 * (nonNeg(own) * den + nonNeg(unknown))) % (2 * den) === den;
}

/** Безопасная ставка по правилу: ближайшее целое к ожиданию, половина — вниз. */
export function safeByRule(own, unknown, face) {
  const den = chanceDen(face);
  const numer = 2 * (nonNeg(own) * den + nonNeg(unknown)) - den;
  return Math.max(0, Math.ceil(numer / (2 * den)));
}
