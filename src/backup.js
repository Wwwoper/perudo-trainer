// backup.js — полная резервная копия данных приложения (экспорт и импорт JSON).
//
// Модуль чистый: с localStorage не работает, читает и пишет через переданные функции.
// Так его можно проверить в Node без браузера (tests/backup.test.js).
//
// Формат файла:
//   { format: 'perudo-backup', version: 2, exportedAt: <мс>, data: { '<ключ хранилища>': <значение> } }
// Старый формат (версия 1: stats, queue, games, duel) при импорте читается и приводится к новому.

export const BACKUP_FORMAT = 'perudo-backup';
export const BACKUP_VERSION = 2;

/** Максимальный размер файла, который мы готовы разбирать (символов). */
export const MAX_BACKUP_CHARS = 5 * 1024 * 1024;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Что лежит в копии: ключ хранилища → проверка значения (возвращает текст ошибки или null). */
const SCHEMA = {
  'perudo.settings': (v) => (isObject(v) ? null : 'настройки должны быть объектом'),
  'perudo.userProfile': (v) => {
    if (!isObject(v)) return 'статистика должна быть объектом';
    if ('n' in v && !isNum(v.n)) return 'статистика: поле n должно быть числом';
    if ('good' in v && !isNum(v.good)) return 'статистика: поле good должно быть числом';
    if ('byMode' in v && !isObject(v.byMode)) return 'статистика: byMode должен быть объектом';
    if ('drill' in v && !isObject(v.drill)) return 'статистика: drill должен быть объектом';
    return null;
  },
  'perudo.botMemory': (v) => (isObject(v) ? null : 'память ботов должна быть объектом'),
  'perudo.games': (v) => {
    if (!Array.isArray(v)) return 'история партий должна быть списком';
    return v.every(isObject) ? null : 'в истории партий есть записи не того вида';
  },
  // Ключевые моменты партий. Пустой объект принимается: так выглядел пустой раздел в первых копиях.
  'perudo.reviews': (v) => {
    if (isObject(v)) return Object.keys(v).length === 0 ? null : 'разбор партий должен быть списком';
    if (!Array.isArray(v)) return 'разбор партий должен быть списком';
    return v.every(isObject) ? null : 'в разборе партий есть записи не того вида';
  },
  'perudo.trainingQueue': (v) => {
    if (!Array.isArray(v)) return 'очередь повторов должна быть списком';
    const ok = v.every((x) => isObject(x) && typeof x.mode === 'string' && isNum(x.n) && isNum(x.f)
      && isNum(x.q) && Array.isArray(x.h) && x.h.every(isNum));
    return ok ? null : 'в очереди повторов есть записи не того вида';
  },
  'perudo.tutorialProgress': (v) => (isObject(v) || Array.isArray(v) ? null : 'прогресс обучения: неверный вид'),
  'perudo.duelStats': (v) => {
    if (!isObject(v)) return 'статистика дуэли должна быть объектом';
    for (const k of ['games', 'wins', 'moves', 'dev']) {
      if (k in v && !isNum(v[k])) return `статистика дуэли: поле ${k} должно быть числом`;
    }
    return null;
  },
  'perudo.characters': (v) => (isObject(v) || Array.isArray(v) ? null : 'персонажи: неверный вид'),
  'perudo.characterMemories': (v) => (isObject(v) || Array.isArray(v) ? null : 'память персонажей: неверный вид'),
};

/** Ключи хранилища, которые входят в копию. */
export const BACKUP_KEYS = Object.keys(SCHEMA);

/** Соответствие полей старой копии (версия 1) ключам хранилища. */
const LEGACY_V1 = {
  stats: 'perudo.userProfile',
  queue: 'perudo.trainingQueue',
  games: 'perudo.games',
  duel: 'perudo.duelStats',
};

/**
 * Собирает копию.
 * @param {(key: string) => any} read значение по ключу или null, если его нет
 * @param {number} [now] время экспорта, мс
 */
export function buildBackup(read, now = Date.now()) {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const value = read(key);
    if (value !== null && value !== undefined) data[key] = value;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

/** Копия как текст файла. */
export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2);
}

/**
 * Разбирает и проверяет текст файла.
 * @returns {{ ok: true, data: object, skipped: string[], legacy: boolean, exportedAt: number|null }
 *   | { ok: false, error: string }}
 * data содержит только известные ключи; skipped — неизвестные ключи, которые были проигнорированы.
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Файл пустой.' };
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'Файл слишком большой для копии данных.' };

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Это не JSON-файл.' };
  }
  if (!isObject(raw)) return { ok: false, error: 'В файле не копия данных Перудо.' };

  let source;
  let legacy = false;
  if (raw.format === BACKUP_FORMAT) {
    if (!isNum(raw.version) || raw.version < 1) return { ok: false, error: 'Не указана версия копии.' };
    if (raw.version > BACKUP_VERSION) {
      return { ok: false, error: 'Копия сделана более новой версией приложения.' };
    }
    if (!isObject(raw.data)) return { ok: false, error: 'В копии нет раздела данных.' };
    source = raw.data;
  } else if (raw.schemaVersion === 1 && ('stats' in raw || 'games' in raw || 'queue' in raw)) {
    legacy = true;
    source = {};
    for (const [from, key] of Object.entries(LEGACY_V1)) {
      if (from in raw) source[key] = raw[from];
    }
  } else {
    return { ok: false, error: 'В файле не копия данных Перудо.' };
  }

  const data = {};
  const skipped = [];
  for (const key of Object.keys(source)) {
    const check = SCHEMA[key];
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, key)) {
      skipped.push(key);
      continue;
    }
    const value = source[key];
    if (value === null) continue;
    const problem = check(value);
    if (problem) return { ok: false, error: `Копия повреждена: ${problem}.` };
    data[key] = value;
  }
  if (!Object.keys(data).length) return { ok: false, error: 'В копии нет данных для восстановления.' };

  return {
    ok: true,
    data,
    skipped,
    legacy,
    exportedAt: isNum(raw.exportedAt) ? raw.exportedAt : null,
  };
}

/**
 * Заменяет данные приложения данными из копии: ключи из копии записываются,
 * остальные ключи копии (которых в файле нет) удаляются.
 * @param {object} data результат parseBackup().data
 * @param {(key: string, value: any) => void} write
 * @param {(key: string) => void} remove
 * @returns {{ written: string[], removed: string[] }}
 */
export function applyBackup(data, write, remove) {
  const written = [];
  const removed = [];
  for (const key of BACKUP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      write(key, data[key]);
      written.push(key);
    } else {
      remove(key);
      removed.push(key);
    }
  }
  return { written, removed };
}
