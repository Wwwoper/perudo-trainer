// src/ui/rounds_log.js — запись завершённых раундов партии (после вскрытия) в хранилище.
//
// Снимок делается перед проверкой или Calza: после неё движок сразу начинает новый раунд и стирает ставки.
// Здесь только запись: правила игры, подсказки и экран она не меняют.

import { getRounds, setRounds } from '../storage.js';
import { snapshotRound, buildRound, appendRounds } from '../rounds.js';

let gameId = '';

/** Партия началась или продолжается после перезагрузки: раунды получают номера вида «партия-rN». */
export function startRoundsLog(id) {
  gameId = String(id ?? '');
}

/** Снимок раунда перед действием, которое его завершит. Возвращает данные для recordRound. */
export function snapRound(game) {
  return snapshotRound(game);
}

/**
 * Раунд закончился вскрытием: сохраняем его (последние 40).
 * @param {object} snap результат snapRound до действия
 * @param {object[]} events события действия
 * @returns {object|null} сохранённый раунд или null (вскрытия нет или данные непригодны)
 */
export function recordRound(snap, events, meId = 'human') {
  const reveal = (events || []).find((e) => e.type === 'DICE_REVEALED');
  if (!reveal) return null;
  const r = buildRound({ id: `${gameId}-r${snap?.round}`, ts: Date.now(), snap, reveal, meId });
  if (!r) return null;
  setRounds(appendRounds(getRounds(), [r]));
  return r;
}
