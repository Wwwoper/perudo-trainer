// data_schema.js — единый слой проверки данных в localStorage, резервной копии и облаке.
//
// Модуль чистый (без localStorage и DOM). Для каждого раздела данных есть функция sanitizeX(raw),
// которая возвращает { value, dropped }:
//   value   — данные в допустимом виде (всегда годятся для работы приложения, при мусоре — значения по умолчанию);
//   dropped — сколько записей пришлось отбросить как повреждённые (для сообщения «пропущено N записей»).
// Отсутствующее значение (null, undefined) повреждением не считается: dropped = 0.

/** Верхняя граница любого счётчика: защита от огромных и нечисловых значений. */
export const MAX_COUNT = 1e9;
/** Сколько разных ключей (режимов, меток) храним в одной таблице счётчиков. */
export const MAX_KEYS = 100;
const MAX_KEY_LEN = 64;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isMissing = (v) => v === null || v === undefined;

/** Неотрицательное целое не больше MAX_COUNT; дробные округляются вниз, всё прочее — null. */
export function toCount(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.min(Math.floor(v), MAX_COUNT);
}

/** Безопасный ключ таблицы: непустая строка разумной длины, не служебное имя объекта. */
export function isSafeKey(k) {
  return typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_LEN && !FORBIDDEN_KEYS.has(k);
}

/** Пара счётчиков { n, good } с условием good ≤ n. Возвращает { value, bad } (bad — были ли исправления). */
function counterPair(raw) {
  if (!isPlainObject(raw)) return { value: { n: 0, good: 0 }, bad: !isMissing(raw) };
  const n = toCount(raw.n);
  const good = toCount(raw.good);
  const bad = n === null || good === null || good > n;
  const nn = n ?? 0;
  return { value: { n: nn, good: Math.min(good ?? 0, nn) }, bad };
}

/** Таблица { ключ: { n, good } }: негодные записи отбрасываются и считаются. */
function counterTable(raw) {
  const value = {};
  let dropped = 0;
  if (isMissing(raw)) return { value, dropped };
  if (!isPlainObject(raw)) return { value, dropped: 1 };
  let kept = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!isSafeKey(k) || kept >= MAX_KEYS || !isPlainObject(v) || toCount(v.n) === null || toCount(v.good) === null) {
      dropped++;
      continue;
    }
    value[k] = counterPair(v).value;
    kept++;
  }
  return { value, dropped };
}

/** Статистика игрока (perudo.userProfile). */
export function sanitizeStats(raw) {
  const out = {
    n: 0, good: 0, totalGames: 0, totalWins: 0, totalDecisions: 0, goodDecisions: 0,
    byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } },
  };
  if (isMissing(raw)) return { value: out, dropped: 0 };
  if (!isPlainObject(raw)) return { value: out, dropped: 1 };
  let dropped = 0;

  for (const k of ['n', 'totalGames', 'totalWins', 'totalDecisions']) {
    if (raw[k] === undefined) continue;
    const c = toCount(raw[k]);
    if (c === null) dropped++; else out[k] = c;
  }
  for (const [k, cap] of [['good', 'n'], ['goodDecisions', 'totalDecisions']]) {
    if (raw[k] === undefined) continue;
    const c = toCount(raw[k]);
    if (c === null) dropped++; else out[k] = c;
    if (out[k] > out[cap]) out[k] = out[cap];
  }
  if (out.totalWins > out.totalGames) out.totalWins = out.totalGames;

  const modes = counterTable(raw.byMode);
  out.byMode = modes.value;
  dropped += modes.dropped;

  if ('byTag' in raw) {
    const tags = counterTable(raw.byTag);
    out.byTag = tags.value;
    dropped += tags.dropped;
  }

  if (raw.drill !== undefined) {
    if (!isPlainObject(raw.drill)) dropped++;
    else {
      for (const k of ['A', 'B']) {
        const p = counterPair(raw.drill[k]);
        out.drill[k] = p.value;
        if (p.bad) dropped++;
      }
    }
  }
  return { value: out, dropped };
}
