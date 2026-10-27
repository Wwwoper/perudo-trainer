// backup.js — полная резервная копия данных приложения (экспорт и импорт JSON).
//
// Модуль чистый: с localStorage не работает, читает и пишет через переданные функции.
// Так его можно проверить в Node без браузера (tests/backup.test.js).
//
// Формат файла:
//   { format: 'perudo-backup', version: 2, exportedAt: <мс>, data: { '<ключ хранилища>': <значение> } }
// Старый формат (версия 1: stats, queue, games, duel) при импорте читается и приводится к новому.
// Данные проходят единую проверку (data_schema.js) в обе стороны: при сборке копии (экспорт, отправка в облако)
// и при разборе файла (импорт, получение из облака). Повреждённые записи пропускаются и подсчитываются.

import { SANITIZERS } from './data_schema.js';

export const BACKUP_FORMAT = 'perudo-backup';
export const BACKUP_VERSION = 2;

/** Максимальный размер файла, который мы готовы разбирать (символов). */
export const MAX_BACKUP_CHARS = 5 * 1024 * 1024;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Ключи хранилища, которые входят в копию. Проверку значений даёт data_schema.js (SANITIZERS). */
export const BACKUP_KEYS = Object.keys(SANITIZERS);

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
    if (value !== null && value !== undefined) data[key] = SANITIZERS[key](value).value;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

/** Копия как текст файла. */
export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2);
}

/**
 * Разбирает и проверяет текст файла.
 * @returns {{ ok: true, data: object, skipped: string[], dropped: number, legacy: boolean, exportedAt: number|null }
 *   | { ok: false, error: string }}
 * data содержит только известные ключи и очищенные значения; skipped — неизвестные ключи, которые были проигнорированы;
 * dropped — сколько повреждённых записей пропущено.
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
  let dropped = 0;
  let usable = 0;                // разделов, из которых что-то удалось прочитать
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(SANITIZERS, key)) {
      skipped.push(key);
      continue;
    }
    const value = source[key];
    if (value === null) continue;
    const r = SANITIZERS[key](value);
    data[key] = r.value;
    dropped += r.dropped;
    // раздел «потерян целиком»: были повреждения и осталось только значение по умолчанию
    const lost = r.dropped > 0 && JSON.stringify(r.value) === JSON.stringify(SANITIZERS[key](null).value);
    if (!lost) usable++;
  }
  if (!Object.keys(data).length) return { ok: false, error: 'В копии нет данных для восстановления.' };
  if (usable === 0) return { ok: false, error: 'Копия повреждена: ни один раздел не удалось прочитать.' };

  return {
    ok: true,
    data,
    skipped,
    dropped,
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
