// src/game_log.js — строки журнала партии по событиям движка (без DOM).
// Кто потерял кубик, кто выбыл, результат Calza: раньше журнал показывал только ставки и «Проверка: …».
// Тексты без прошедшего времени («выбывает»), чтобы не гадать с родом имени.

const nameOf = (players, id) => (Array.isArray(players) ? players : []).find((p) => p && p.id === id)?.name || 'Игрок';

/**
 * @param {object[]} events res.events после действия (DICE_REVEALED, PLAYER_LOST_DIE, PLAYER_ELIMINATED, PLAYER_GAINED_DIE)
 * @param {object[]} players game.players (id, name)
 * @param {string} meId id человека: про него пишем «Вы»
 * @returns {{type: 'result'|'loss'|'elim'|'gain', text: string}[]} text — обычный текст, без HTML
 */
export function describeRoundEvents(events, players, meId = 'human') {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || typeof e !== 'object') continue;
    const you = e.playerId === meId;
    const who = you ? 'Вы' : nameOf(players, e.playerId);
    if (e.type === 'DICE_REVEALED' && e.kind === 'calza') {
      const q = e.bid?.q ?? e.bid?.quantity;
      out.push({ type: 'result', text: `Calza: на столе ${e.actualCount} из ${q} — ${e.calzaExact ? 'точно' : 'мимо'}.` });
    } else if (e.type === 'PLAYER_LOST_DIE' && e.newDiceCount > 0) {
      // последний кубик описывает следующая запись о выбывании
      out.push({ type: 'loss', text: `${who} ${you ? 'теряете' : 'теряет'} кубик (осталось: ${e.newDiceCount}).` });
    } else if (e.type === 'PLAYER_ELIMINATED') {
      out.push({
        type: 'elim',
        text: you ? '✖ Вы остаётесь без кубиков и выбываете из игры.' : `✖ ${who} остаётся без кубиков и выбывает из игры.`,
      });
    } else if (e.type === 'PLAYER_GAINED_DIE') {
      out.push({ type: 'gain', text: `${who} ${you ? 'получаете' : 'получает'} кубик (стало: ${e.newDiceCount}).` });
    }
  }
  return out;
}

// ---------- Строки журнала: единый шаблон (патч 214) ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Пометка в третьей колонке строки: у ставки пусто, у вызова — «Не верю!» или «Calza!». */
export function noteHtml(kind) {
  if (kind === 'dudo') return '<b class="text-bad">Не верю!</b>';
  if (kind === 'calza') return '<b class="warn">Calza!</b>';
  return '';
}

/**
 * Строка журнала в три колонки: имя | чип ставки (у вызова — проверяемая ставка) | пометка.
 * @param {{name: string, color: number, chip?: string, kind?: 'raise'|'dudo'|'calza'}} p chip — готовая разметка чипа
 */
export function logRowHtml({ name, color, chip = '', kind = 'raise' }) {
  const idx = Number.isInteger(color) && color >= 0 && color <= 9 ? color : 0;
  return `<span class="log-name c${idx}">${esc(name)}</span><span class="log-chip">${chip}</span><span class="log-note">${noteHtml(kind)}</span>`;
}

/** Итог проверки отдельной строкой под вызовом. */
export function checkText(actual, q, ok) {
  return `Проверка: на столе ${actual} из ${q} — ${ok ? 'ставка верна' : 'ставка ложна'}.`;
}

/** Заголовок раунда обычным регистром, без украшающих тире. */
export function roundHeadText({ round, total, starter, palifico = false }) {
  return `Раунд ${round} · кубиков на столе: ${total} · начинает: ${starter}${palifico ? ' · Палифико' : ''}`;
}
