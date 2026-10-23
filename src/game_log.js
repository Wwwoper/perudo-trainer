// src/game_log.js — строки журнала партии по событиям движка (без DOM).
// Кто потерял кубик, кто выбыл, результат Calza: раньше журнал показывал только ставки и «Проверка: …».
// Тексты без прошедшего времени («выбывает»), чтобы не гадать с родом имени.

const nameOf = (players, id) => (Array.isArray(players) ? players : []).find((p) => p && p.id === id)?.name || 'Игрок';

/**
 * @param {object[]} events res.events после действия (DICE_REVEALED, PLAYER_LOST_DIE, PLAYER_ELIMINATED, PLAYER_GAINED_DIE)
 * @param {object[]} players game.players (id, name)
 * @param {string} meId id человека: про него пишем «Вы»
 * @returns {{type: 'round'|'loss'|'elim'|'gain', text: string}[]} text — обычный текст, без HTML
 */
export function describeRoundEvents(events, players, meId = 'human') {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || typeof e !== 'object') continue;
    const you = e.playerId === meId;
    const who = you ? 'Вы' : nameOf(players, e.playerId);
    if (e.type === 'DICE_REVEALED' && e.kind === 'calza') {
      const q = e.bid?.q ?? e.bid?.quantity;
      out.push({ type: 'round', text: `Calza: на столе ${e.actualCount} из ${q} — ${e.calzaExact ? 'точно' : 'мимо'}.` });
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
