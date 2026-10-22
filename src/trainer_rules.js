// src/trainer_rules.js — проверка ставки игрока в тренажёре по правилам игры (без DOM).

import { legal, minLegal } from './rules.js';

/**
 * Проверяет ставку Q×F после чужой ставки cur.q×cur.f.
 * Возвращает { ok: true } или { ok: false, message }.
 * Недопустимая ставка не должна оцениваться и попадать в статистику.
 */
export function checkRaise(Q, F, cur) {
  const { n, q, f, m } = cur;
  const rules = { wild: m.wild };
  if (!Number.isInteger(Q) || Q < 1 || !Number.isInteger(F) || F < 1 || F > 6) {
    return { ok: false, message: 'Укажите количество и цифру ставки.' };
  }
  if (Q > n) return { ok: false, message: 'Ставка больше общего числа кубиков.' };
  if (legal(Q, F, { q, f }, rules)) return { ok: true };

  for (let x = 1; x <= n; x++) {
    if (legal(x, F, { q, f }, rules)) {
      return { ok: false, message: `После ${q}×${f} ставка на цифру ${F} должна быть не меньше ${x}×${F}.` };
    }
  }
  const why = m.wild ? '' : ' В этом режиме можно повышать только количество на ту же цифру.';
  return { ok: false, message: `После ${q}×${f} на цифру ${F} ставить нельзя.${why}` };
}

/** Допустимая ставка для полей по умолчанию или null, если повысить нельзя (остаётся «Не верю»). */
export function defaultRaise(cur) {
  return minLegal({ q: cur.q, f: cur.f }, cur.n, { wild: cur.m.wild });
}
