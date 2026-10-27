// storage.js — работа с localStorage с версионированием

import { sanitizePlayer } from './player.js';
import { sanitizeDeviceState } from './backup_reminder.js';
import { sanitizeCloudState } from './cloud_policy.js';
import { sanitizeGameSettings } from './game_settings.js';
import { makeSnapshot, restoreSnapshot } from './saved_game.js';
import { sanitizeSoundMode } from './sound_plan.js';
import { sanitizeStats, sanitizeTrainingQueue, sanitizeGames, sanitizeReviews, sanitizeDuelStats, sanitizeBotMemory } from './data_schema.js';

const SCHEMA_VERSION = 1;

const KEYS = {
  SETTINGS: 'perudo.settings',
  USER_PROFILE: 'perudo.userProfile',
  CHARACTERS: 'perudo.characters',
  CHARACTER_MEMORIES: 'perudo.characterMemories',
  BOT_MEMORY: 'perudo.botMemory',
  GAMES: 'perudo.games',
  REVIEWS: 'perudo.reviews',
  PLAYER: 'perudo.player',
  DEVICE: 'perudo.device',
  ACTIVE_GAME: 'perudo.activeGame',
  CLOUD: 'perudo.cloud',
  TRAINING_QUEUE: 'perudo.trainingQueue',
  TUTORIAL_PROGRESS: 'perudo.tutorialProgress',
  DUEL_STATS: 'perudo.duelStats',
  SCHEMA_VERSION: 'perudo.schemaVersion',
};

export function get(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

export function getSettings() {
  return get(KEYS.SETTINGS, {
    assistMode: 'training',
    botSpeed: 'normal',
    animations: 'normal',
    calzaEnabled: false,
    palificoEnabled: false,
  });
}

export function setSettings(settings) {
  set(KEYS.SETTINGS, { ...getSettings(), ...settings });
}

// Настройки последней сыгранной партии: лежат в perudo.settings.lastGame (так попадают в экспорт и копию).
// null — партий с сохранёнными настройками ещё не было.
export function getLastGameSettings() {
  const s = get(KEYS.SETTINGS, null);
  const raw = s && typeof s === 'object' ? s.lastGame : null;
  return raw ? sanitizeGameSettings(raw) : null;
}

export function setLastGameSettings(settings) {
  setSettings({ lastGame: sanitizeGameSettings(settings) });
}

export function clearLastGameSettings() {
  const s = get(KEYS.SETTINGS, null);
  if (!s || typeof s !== 'object' || !('lastGame' in s)) return;
  const { lastGame, ...rest } = s;
  set(KEYS.SETTINGS, rest);
}

// Незавершённая партия: снимок для «Продолжить» после перезагрузки. Это состояние устройства:
// в резервную копию и в облако не входит (BACKUP_KEYS его не содержит).
// getActiveGame возвращает проверенные данные или null (нет снимка, он устарел или повреждён).
export function getActiveGame() {
  return restoreSnapshot(get(KEYS.ACTIVE_GAME, null));
}

/** Сохраняет снимок; false, если партии нет или она не идёт (тогда прежний снимок остаётся как был). */
export function setActiveGame(parts) {
  const snap = makeSnapshot(parts);
  if (!snap) return false;
  set(KEYS.ACTIVE_GAME, snap);
  return true;
}

export function clearActiveGame() {
  try { localStorage.removeItem(KEYS.ACTIVE_GAME); } catch (e) {}
}

// Звуки: режим «выкл / тихо / обычно». Хранится в perudo.settings.soundMode; по умолчанию выключены.
export function getSoundMode() {
  const s = get(KEYS.SETTINGS, null);
  return sanitizeSoundMode(s && typeof s === 'object' ? s.soundMode : null);
}

export function setSoundMode(mode) {
  setSettings({ soundMode: sanitizeSoundMode(mode) });
}

// Профиль игрока: имя и аватар. Проверку и значения по умолчанию даёт sanitizePlayer.
export function getPlayer() {
  return sanitizePlayer(get(KEYS.PLAYER, null));
}

export function setPlayer(player) {
  set(KEYS.PLAYER, sanitizePlayer(player));
}

// Состояние этого устройства: когда напомнить про копию, сколько раз просили постоянное хранилище.
// В резервную копию не входит (BACKUP_KEYS его не содержит).
export function getDeviceState() {
  return sanitizeDeviceState(get(KEYS.DEVICE, null));
}

export function setDeviceState(state) {
  set(KEYS.DEVICE, sanitizeDeviceState(state));
}

// Вход в облако (токен Яндекса и версия копии, с которой синхронизировались). Только для этого устройства:
// в резервную копию JSON не входит, чтобы токен не оказался в файле.
export function getCloudState() {
  return sanitizeCloudState(get(KEYS.CLOUD, null));
}

export function setCloudState(state) {
  set(KEYS.CLOUD, sanitizeCloudState(state));
}

// Что боты помнят об игроке (см. memory.js). Проверку формата делает normalizeMemory.
export function getBotMemory() {
  return sanitizeBotMemory(get(KEYS.BOT_MEMORY, null)).value;
}

export function setBotMemory(memory) {
  set(KEYS.BOT_MEMORY, sanitizeBotMemory(memory).value);
}

/** Статистика Дуэли. */
export function getDuelStats() {
  return sanitizeDuelStats(get(KEYS.DUEL_STATS, null)).value;
}

export function setDuelStats(stats) {
  set(KEYS.DUEL_STATS, sanitizeDuelStats(stats).value);
}

export function getStats() {
  return sanitizeStats(get(KEYS.USER_PROFILE, null)).value;
}

export function setStats(stats) {
  set(KEYS.USER_PROFILE, sanitizeStats(stats).value);
}

/**
 * Меняет статистику «прочитал → изменил → записал» за один вызов.
 *
 * Статистику пишут сразу несколько разделов (тренажёр, упражнения, итог партии),
 * и каждый сохраняет объект целиком. Если держать объект в переменной с момента
 * загрузки страницы, запись одного раздела затирает счётчики другого.
 * Поэтому перед каждым изменением читаем актуальное значение из хранилища.
 *
 * @param {(stats: object) => void} mutator меняет переданный объект на месте
 * @returns {object} сохранённая статистика
 */
export function updateStats(mutator) {
  const stats = getStats();
  mutator(stats);
  setStats(stats);
  return stats;
}

export function getTrainingQueue() {
  return sanitizeTrainingQueue(get(KEYS.TRAINING_QUEUE, null)).value;
}

export function setTrainingQueue(queue) {
  set(KEYS.TRAINING_QUEUE, sanitizeTrainingQueue(queue).value);
}

export function getGames(limit = 200) {
  return sanitizeGames(get(KEYS.GAMES, null)).value.slice(-limit);
}

/** Добавляет сыгранную партию в историю (хранятся последние 200). */
export function addGame(record) {
  set(KEYS.GAMES, sanitizeGames([...getGames(), record]).value);
}

/** Ключевые моменты партий (ключ perudo.reviews). Мусор в хранилище отбрасывается. */
export function getMoments() {
  return sanitizeReviews(get(KEYS.REVIEWS, null)).value;
}

export function setMoments(moments) {
  set(KEYS.REVIEWS, sanitizeReviews(moments).value);
}

export function getSchemaVersion() {
  return get(KEYS.SCHEMA_VERSION, 0);
}

export function setSchemaVersion(version) {
  set(KEYS.SCHEMA_VERSION, version);
}

export function migrateIfNeeded() {
  const currentVersion = getSchemaVersion();
  if (currentVersion === 0) {
    setSchemaVersion(SCHEMA_VERSION);
  } else if (currentVersion < SCHEMA_VERSION) {
    setSchemaVersion(SCHEMA_VERSION);
  }
}
