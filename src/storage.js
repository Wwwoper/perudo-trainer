// storage.js — работа с localStorage с версионированием

import { normalizeMoments } from './moments.js';

const SCHEMA_VERSION = 1;

const KEYS = {
  SETTINGS: 'perudo.settings',
  USER_PROFILE: 'perudo.userProfile',
  CHARACTERS: 'perudo.characters',
  CHARACTER_MEMORIES: 'perudo.characterMemories',
  BOT_MEMORY: 'perudo.botMemory',
  GAMES: 'perudo.games',
  REVIEWS: 'perudo.reviews',
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

// Что боты помнят об игроке (см. memory.js). Проверку формата делает normalizeMemory.
export function getBotMemory() {
  return get(KEYS.BOT_MEMORY, null);
}

export function setBotMemory(memory) {
  set(KEYS.BOT_MEMORY, memory);
}

export function getStats() {
  return get(KEYS.USER_PROFILE, {
    n: 0,
    good: 0,
    totalGames: 0,
    totalWins: 0,
    totalDecisions: 0,
    goodDecisions: 0,
    byMode: {},
    drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } },
  });
}

export function setStats(stats) {
  set(KEYS.USER_PROFILE, stats);
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
  stats.byMode = stats.byMode || {};
  stats.drill = stats.drill || {};
  stats.drill.A = stats.drill.A || { n: 0, good: 0 };
  stats.drill.B = stats.drill.B || { n: 0, good: 0 };
  mutator(stats);
  setStats(stats);
  return stats;
}

export function getTrainingQueue() {
  return get(KEYS.TRAINING_QUEUE, []);
}

export function setTrainingQueue(queue) {
  set(KEYS.TRAINING_QUEUE, queue);
}

export function getGames(limit = 200) {
  const games = get(KEYS.GAMES, []);
  return games.slice(-limit);
}

/** Ключевые моменты партий (ключ perudo.reviews). Мусор в хранилище отбрасывается. */
export function getMoments() {
  return normalizeMoments(get(KEYS.REVIEWS, []));
}

export function setMoments(moments) {
  set(KEYS.REVIEWS, normalizeMoments(moments));
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

export function exportData() {
  const data = {};
  for (const key of Object.values(KEYS)) {
    data[key] = get(key);
  }
  data.exportedAt = Date.now();
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

export function importData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid data format');
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'exportedAt' && key !== 'schemaVersion' && Object.values(KEYS).includes(key)) {
      set(key, value);
    }
  }
}
