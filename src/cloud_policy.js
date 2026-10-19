// cloud_policy.js — правила облачной копии: чистая логика без сети и без браузера.
//
// Что хранится на устройстве (ключ perudo.cloud, в резервную копию JSON не входит):
//   token             — токен Яндекса (только право на папку приложения на Диске);
//   expiresAt         — до какого момента (мс) токен действителен;
//   syncedExportedAt  — значение exportedAt той копии, с которой это устройство синхронизировалось
//                       в последний раз (записало её или восстановило из неё);
//   syncedHash        — отпечаток данных устройства на тот момент: по нему видно, менялось ли что-то
//                       на устройстве с тех пор («не менялось» + в облаке новее = можно молча подтянуть).
// Сравнивать версии по exportedAt внутри файла надёжнее, чем по времени изменения файла на Диске:
// загрузка на Диск асинхронна, и «время изменения» сразу после записи может ещё быть старым.

export const MIN_SAVE_INTERVAL_MS = 30_000;     // не чаще одной записи в 30 секунд
const TOKEN_MARGIN_MS = 60_000;                  // токен считаем истёкшим за минуту до срока
const TOKEN_RE = /^[A-Za-z0-9_\-.]{10,300}$/;
const HASH_RE = /^[0-9a-f]{1,32}$/;

const isTime = (v) => Number.isFinite(v) && v >= 0 && v <= 8.64e15;

export function defaultCloudState() {
  return { token: '', expiresAt: 0, syncedExportedAt: null, syncedHash: '' };
}

/** Приводит что угодно к состоянию облака; токен неверного вида отбрасывается вместе со сроком. */
export function sanitizeCloudState(raw) {
  const d = defaultCloudState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const token = typeof raw.token === 'string' && TOKEN_RE.test(raw.token) ? raw.token : '';
  return {
    token,
    expiresAt: token && isTime(raw.expiresAt) ? raw.expiresAt : 0,
    syncedExportedAt: isTime(raw.syncedExportedAt) ? raw.syncedExportedAt : null,
    syncedHash: typeof raw.syncedHash === 'string' && HASH_RE.test(raw.syncedHash) ? raw.syncedHash : '',
  };
}

/** Короткий отпечаток текста (cyrb53, 53 бита, hex). Не для защиты: только чтобы заметить, что данные изменились. */
export function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Сводка данных для окна выбора: чтобы игрок видел, чем отличаются версии.
 * @param {object} data содержимое копии (ключи хранилища)
 * @returns {{name: string, games: number, lastGameAt: number|null, answers: number}}
 */
export function summarizeBackupData(data) {
  const d = data && typeof data === 'object' ? data : {};
  const prof = d['perudo.userProfile'] && typeof d['perudo.userProfile'] === 'object' ? d['perudo.userProfile'] : {};
  const games = Array.isArray(d['perudo.games']) ? d['perudo.games'] : [];
  const name = typeof d['perudo.player']?.name === 'string' && d['perudo.player'].name.trim() ? d['perudo.player'].name.trim() : '';
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  let last = null;
  for (const g of games) if (isTime(g?.ts) && (last === null || g.ts > last)) last = g.ts;
  return {
    name,
    games: Math.max(num(prof.totalGames), games.length),
    lastGameAt: last,
    answers: num(prof.n),
  };
}

/** Токен есть и ещё действует. */
export function hasValidToken(state, now = Date.now()) {
  const s = sanitizeCloudState(state);
  return !!s.token && s.expiresAt > now + TOKEN_MARGIN_MS;
}

/**
 * Данных игры на устройстве нет: ни партий, ни решений, ни очереди повторов.
 * Имя и настройки в расчёт не берутся: они не мешают восстановить копию.
 * @param {{stats?: object, games?: any[], queue?: any[], reviews?: any[]}} d
 */
export function isLocalDataEmpty({ stats, games, queue, reviews } = {}) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const len = (v) => (Array.isArray(v) ? v.length : 0);
  return n(stats?.n) === 0 && n(stats?.totalGames) === 0 && n(stats?.totalDecisions) === 0
    && len(games) === 0 && len(queue) === 0 && len(reviews) === 0;
}

/**
 * Что делать при запуске, когда вход выполнен и копия в облаке прочитана.
 * @param {{localEmpty: boolean, cloudExportedAt: number|null, syncedExportedAt: number|null, localChanged?: boolean}} s
 *   cloudExportedAt — null, если файла в облаке нет;
 *   localChanged    — данные устройства менялись после последней синхронизации (по умолчанию да: так осторожнее)
 * @returns {{restore: 'none'|'offer'|'ask'|'auto', upload: boolean}}
 *   restore 'offer' — на устройстве пусто, предложить восстановить;
 *   restore 'auto'  — устройство не менялось, а в облаке новее: взять облако без вопросов;
 *   restore 'ask'   — менялись и устройство, и облако, пусть игрок выберет;
 *   upload          — можно писать копию в облако без вопросов.
 *   Пустое устройство в облако не пишем: иначе можно затереть хорошую копию пустой.
 */
export function planSync({ localEmpty, cloudExportedAt, syncedExportedAt, localChanged = true }) {
  const hasCloud = isTime(cloudExportedAt);
  if (!hasCloud) return { restore: 'none', upload: !localEmpty };
  if (localEmpty) return { restore: 'offer', upload: false };
  if (isTime(syncedExportedAt) && syncedExportedAt === cloudExportedAt) return { restore: 'none', upload: true };
  if (!localChanged && isTime(syncedExportedAt)) return { restore: 'auto', upload: false };
  return { restore: 'ask', upload: false };
}

/** Запись разрешена: прошло достаточно времени с прошлой (lastSaveAt — null, если ещё не писали). */
export function canSaveNow({ now, lastSaveAt, minInterval = MIN_SAVE_INTERVAL_MS }) {
  if (!isTime(now)) return false;
  return !isTime(lastSaveAt) || now - lastSaveAt >= minInterval;
}
