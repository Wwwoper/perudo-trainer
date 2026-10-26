// src/ui/bot_mind.js — что боты помнят об игроке и насколько ошибаются (настройки партии).
// Состояние живёт здесь; память сохраняется в localStorage через storage.js.

import { getBotMemory, setBotMemory } from '../storage.js';
import { DEFAULT_BOT_LEVEL, noiseForLevel } from '../bots.js';
import { createMemory, normalizeMemory, observeEvent, opponentModel, describeMemory } from '../memory.js';
import { $ } from './common.js';

// Что боты помнят об игроке (между партиями, в localStorage).
let botMemory = normalizeMemory(getBotMemory());
// Настройки применяются к новой партии, как и остальные.
let gameBotLevel = DEFAULT_BOT_LEVEL;
let gameMemoryOn = true;

function renderMemoryInfo() {
  const info = $('#gMemoryInfo');
  if (info) info.textContent = describeMemory(botMemory);
}

/** Забыть игрока: пустая память, сохранение и обновление подписи. */
export function resetBotMemory() {
  botMemory = createMemory();
  setBotMemory(botMemory);
  renderMemoryInfo();
}

export function setupBotMind() {
  $('#gMemoryReset')?.addEventListener('click', resetBotMemory);
  renderMemoryInfo();
}

/** «Сбросить всё» на вкладке «Статистика»: память уже стёрта из localStorage, обнуляем её в приложении. */
export function clearBotMemoryState() {
  botMemory = createMemory();
  renderMemoryInfo();
}

/** Читает уровень ботов и переключатель памяти из настроек при старте новой партии. */
export function applyBotMindSettings() {
  gameBotLevel = $('#gBotLevel')?.value || DEFAULT_BOT_LEVEL;
  gameMemoryOn = $('#gMemoryOpt') ? $('#gMemoryOpt').checked : true;
}

/** Текущие настройки умов ботов (для снимка партии). */
export function getBotMind() {
  return { level: gameBotLevel, memory: gameMemoryOn };
}

/** Вернуть настройки умов ботов из снимка: партия продолжается с теми же уровнем и памятью. */
export function setBotMind({ level, memory }) {
  gameBotLevel = level || DEFAULT_BOT_LEVEL;
  gameMemoryOn = memory !== false;
}

/** Параметры решения бота: множитель ошибок и модель игрока (если память включена и ставка его). */
export function botMindFor(game) {
  return {
    noise: noiseForLevel(gameBotLevel),
    opponent: gameMemoryOn && game.bid && game.bid.playerId === game.players[0].id
      ? opponentModel(botMemory) : null,
  };
}

// Боты замечают, когда проверили ставку человека и она оказалась (не)ложной.
export function observeReveal(events, game) {
  if (!gameMemoryOn || !game) return;
  const humanId = game.players[0].id;
  let next = botMemory;
  for (const e of events || []) next = observeEvent(next, e, humanId);
  if (next !== botMemory) {
    botMemory = next;
    setBotMemory(botMemory);
    renderMemoryInfo();
  }
}
