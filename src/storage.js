// storage.js — работа с localStorage с версионированием

const SCHEMA_VERSION = 1;

const KEYS = {
  SETTINGS: 'perudo.settings',
  USER_PROFILE: 'perudo.userProfile',
  CHARACTERS: 'perudo.characters',
  CHARACTER_MEMORIES: 'perudo.characterMemories',
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
