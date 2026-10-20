// src/games_list.js — строки списка партий в «Результатах»: дата, итог, краткие числа (без DOM).

/** Сколько последних партий показано сразу. */
export const GAMES_SHOWN = 10;

/** Склонение по числу: plural(2, ['игрок', 'игрока', 'игроков']) → «игрока». */
export function plural(n, [one, few, many]) {
  const m100 = Math.abs(n) % 100;
  const m10 = m100 % 10;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * «19.10, 09:17»; если партия не в текущем году — «19.10.2025, 09:17».
 * Время местное. Некорректная метка времени даёт «—», а не «NaN».
 */
export function formatGameWhen(ts, now = Date.now()) {
  const d = new Date(ts);
  if (typeof ts !== 'number' || Number.isNaN(d.getTime())) return '—';
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : `.${d.getFullYear()}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${year}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** «4 игрока · 19 раундов · 15 решений» */
export function formatGameMeta(g) {
  const players = count(g?.players);
  const rounds = count(g?.rounds);
  const decisions = count(g?.decisions);
  return `${players} ${plural(players, ['игрок', 'игрока', 'игроков'])} · ` +
    `${rounds} ${plural(rounds, ['раунд', 'раунда', 'раундов'])} · ` +
    `${decisions} ${plural(decisions, ['решение', 'решения', 'решений'])}`;
}

/**
 * Какие партии показать: свежие сверху. История хранится от старых к новым.
 * @returns {{items: object[], hidden: number}} hidden — сколько партий скрыто за «Показать все»
 */
export function visibleGames(history, expanded = false, shown = GAMES_SHOWN) {
  const list = Array.isArray(history) ? history.filter((g) => g && typeof g === 'object') : [];
  const newestFirst = list.slice().reverse();
  if (expanded || newestFirst.length <= shown) return { items: newestFirst, hidden: 0 };
  return { items: newestFirst.slice(0, shown), hidden: newestFirst.length - shown };
}
