// opponents_text.js — тексты вкладки «Стол»: что видно по вскрытым ставкам соперника.
//
// Чистый модуль. Только наблюдения и счётчики; оценок вроде «блефует» здесь нет: ставка без нужной цифры в руке
// могла опираться на кубики других игроков.

import { OBS_MIN } from './opponents.js';

export const TABLE_EMPTY = 'Профиль соперников появится после первого вскрытия: он строится только по ставкам, чьи кубики стали известны.';
export const TABLE_NOTE = 'Это наблюдения за вскрытыми ставками этой партии. Если в руке автора не было нужной цифры, это ещё не блеф: ставка могла опираться на кубики других игроков. Выводы о манере игры по этим числам остаются предположением.';

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const pc = (x) => `${Math.round(x * 100)} %`;
const num1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

/**
 * Строки профиля одного соперника.
 * @param {object} p профиль из opponentProfiles
 * @returns {{enough: boolean, lines: string[]}}
 */
export function profileLines(p) {
  const lines = [];
  lines.push(`Раундов вместе: ${p.seen}. Вскрыто ставок: ${p.bids}.`);
  if (!p.bids) {
    lines.push(`Пока мало данных: нужно хотя бы ${OBS_MIN} вскрытых ${plural(OBS_MIN, 'ставка', 'ставки', 'ставок')}.`);
  } else if (!p.enough) {
    lines.push(`Пока мало данных: вскрыто ${p.bids} из ${OBS_MIN}. Нужная цифра в руке автора: целиком ${p.all}, частично ${p.part}, не было ${p.none}.`);
  } else {
    lines.push(`Нужная цифра в руке автора ставки: целиком в ${pc(p.all / p.bids)}, частично в ${pc(p.part / p.bids)}, ни одного кубика в ${pc(p.none / p.bids)}.`);
    if (p.raises > 0 && p.avgJump !== null) {
      lines.push(`Средний шаг повышения: ${p.avgJump >= 0 ? '+' : '−'}${num1(Math.abs(p.avgJump))} (повышений: ${p.raises}).`);
    }
  }
  if (p.dudos > 0) {
    lines.push(`Проверял ставки: ${p.dudos} ${plural(p.dudos, 'раз', 'раза', 'раз')}, ставка оказывалась ложной ${p.dudoHit} ${plural(p.dudoHit, 'раз', 'раза', 'раз')}.`);
  }
  if (p.calzas > 0) lines.push(`Calza: ${p.calzas} ${plural(p.calzas, 'раз', 'раза', 'раз')}.`);
  return { enough: p.enough, lines };
}
