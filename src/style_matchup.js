// src/style_matchup.js — «Разбор против стиля бота»: как вы отвечали на ставки ботов каждого стиля ← чистая логика (без DOM).
//
// Источник — вскрытые раунды партии (rounds.js). Ответом на ставку считается ваше следующее действие: повышение
// или проверка («Не верю!» / Calza) ставки бота. Ответы считаются по стилю того, кто сделал предыдущую ставку.
// Это наблюдения, а не оценка: ставка могла быть и сильной, и слабой независимо от стиля.

import { sanitizeRound } from './rounds.js';

/** Сколько ответов нужно, чтобы сравнивать стили между собой (меньше — только счётчики). */
export const MATCHUP_MIN = 5;
/** Разница среднего шага повышения, с которой её стоит упоминать. */
export const JUMP_GAP = 0.5;

/**
 * @param {object[]} rounds раунды из хранилища (мусор и старые записи без ids отбрасываются)
 * @returns {{rounds: number, styles: {style: string, replies: number, raises: number, dudos: number, calzas: number,
 *   dudoRight: number, avgJump: number|null, enough: boolean}[]}}
 *   dudoRight — сколько ваших проверок оказались верными (ставка бота была ложной)
 */
export function styleMatchups(rounds) {
  const by = new Map();
  let used = 0;
  const get = (style) => {
    if (!by.has(style)) by.set(style, { style, raises: 0, jumpSum: 0, dudos: 0, calzas: 0, dudoRight: 0 });
    return by.get(style);
  };
  for (const raw of Array.isArray(rounds) ? rounds : []) {
    const r = sanitizeRound(raw);
    if (!r || !r.ids || r.me < 0) continue;
    used++;
    r.bids.forEach((b, i) => {
      if (b.s !== r.me || i === 0) return;
      const prev = r.bids[i - 1];
      const st = prev.s === r.me ? null : r.styles[prev.s];
      if (!st) return;
      const m = get(st);
      m.raises++;
      m.jumpSum += b.q - prev.q;
    });
    if (r.end.by === r.me && r.end.bidder !== r.me && r.styles[r.end.bidder]) {
      const m = get(r.styles[r.end.bidder]);
      if (r.end.kind === 'dudo') { m.dudos++; if (!r.end.ok) m.dudoRight++; } else m.calzas++;
    }
  }
  const styles = [...by.values()].map(({ jumpSum, ...m }) => {
    const replies = m.raises + m.dudos + m.calzas;
    return { ...m, replies, avgJump: m.raises ? jumpSum / m.raises : null, enough: replies >= MATCHUP_MIN };
  });
  return { rounds: used, styles };
}

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const num1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const signed = (x) => `${x >= 0 ? '+' : '−'}${num1(Math.abs(x))}`;

export const MATCHUP_TITLE = 'Как вы отвечали разным стилям';
export const MATCHUP_NOTE = 'Считаются ваши ответы на ставки ботов: повышение или проверка. Это наблюдения за одной партией, а не оценка вашей игры или стиля бота.';

/**
 * Строки для одного стиля.
 * @param {object} m элемент styles из styleMatchups
 * @returns {string[]}
 */
export function matchupLines(m) {
  const lines = [`Ответов на ставки этого стиля: ${m.replies}. Повышений: ${m.raises}, проверок: ${m.dudos}, Calza: ${m.calzas}.`];
  if (m.raises > 0 && m.avgJump !== null) lines.push(`Средний шаг вашего повышения: ${signed(m.avgJump)}.`);
  if (m.dudos > 0) {
    lines.push(`Ваша проверка оказывалась верной ${m.dudoRight} ${plural(m.dudoRight, 'раз', 'раза', 'раз')} из ${m.dudos}.`);
  }
  if (!m.enough) lines.push(`Пока мало данных: ответов ${m.replies} из ${MATCHUP_MIN}, сравнивать стили рано.`);
  return lines;
}

/**
 * Сравнение двух стилей по среднему шагу повышения (только при достаточных данных у обоих) или пустая строка.
 * @param {object[]} styles styles из styleMatchups
 * @param {(style: string) => string} nameOf название стиля для показа
 */
export function compareLine(styles, nameOf = (s) => s) {
  const ok = (styles || []).filter((m) => m.enough && m.avgJump !== null);
  if (ok.length < 2) return '';
  const sorted = [...ok].sort((a, b) => b.avgJump - a.avgJump);
  const hi = sorted[0]; const lo = sorted.at(-1);
  if (hi.avgJump - lo.avgJump < JUMP_GAP) return '';
  return `Шаг повышения у вас был больше против стиля «${nameOf(hi.style)}» (${signed(hi.avgJump)}), чем против «${nameOf(lo.style)}» (${signed(lo.avgJump)}).`;
}
