// cloud_policy.js — правила облачной копии: чистая логика без сети и без браузера.
//
// Что хранится на устройстве (ключ perudo.cloud, в резервную копию JSON не входит):
//   token             — токен Яндекса (только право на папку приложения на Диске);
//   expiresAt         — до какого момента (мс) токен действителен;
//   syncedExportedAt  — значение exportedAt той копии, с которой это устройство синхронизировалось
//                       в последний раз (записало её или восстановило из неё).
// Сравнивать версии по exportedAt внутри файла надёжнее, чем по времени изменения файла на Диске:
// загрузка на Диск асинхронна, и «время изменения» сразу после записи может ещё быть старым.

export const MIN_SAVE_INTERVAL_MS = 30_000;     // не чаще одной записи в 30 секунд
const TOKEN_MARGIN_MS = 60_000;                  // токен считаем истёкшим за минуту до срока
const TOKEN_RE = /^[A-Za-z0-9_\-.]{10,300}$/;

const isTime = (v) => Number.isFinite(v) && v >= 0 && v <= 8.64e15;

export function defaultCloudState() {
  return { token: '', expiresAt: 0, syncedExportedAt: null };
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
 * @param {{localEmpty: boolean, cloudExportedAt: number|null, syncedExportedAt: number|null}} s
 *   cloudExportedAt — null, если файла в облаке нет
 * @returns {{restore: 'none'|'offer'|'ask', upload: boolean}}
 *   restore 'offer' — на устройстве пусто, предложить восстановить;
 *   restore 'ask'   — данные есть и там и там, пусть игрок выберет;
 *   upload          — можно писать копию в облако без вопросов.
 *   Пустое устройство в облако не пишем: иначе можно затереть хорошую копию пустой.
 */
export function planSync({ localEmpty, cloudExportedAt, syncedExportedAt }) {
  const hasCloud = isTime(cloudExportedAt);
  if (!hasCloud) return { restore: 'none', upload: !localEmpty };
  if (localEmpty) return { restore: 'offer', upload: false };
  if (isTime(syncedExportedAt) && syncedExportedAt === cloudExportedAt) return { restore: 'none', upload: true };
  return { restore: 'ask', upload: false };
}

/** Запись разрешена: прошло достаточно времени с прошлой (lastSaveAt — null, если ещё не писали). */
export function canSaveNow({ now, lastSaveAt, minInterval = MIN_SAVE_INTERVAL_MS }) {
  if (!isTime(now)) return false;
  return !isTime(lastSaveAt) || now - lastSaveAt >= minInterval;
}
