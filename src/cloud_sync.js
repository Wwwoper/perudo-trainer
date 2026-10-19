// cloud_sync.js — сценарии облачной копии: запуск, запись после партии, восстановление, выход.
//
// Модуль не знает ни про браузер, ни про интерфейс: всё внешнее передаётся снаружи
// (клиент Диска, чтение и запись состояния, снимок данных, проверка «данных нет»).
// Поэтому все ветки проверяются в Node на поддельных зависимостях.
//
// Правила безопасности данных:
//  - перед КАЖДОЙ записью (автоматической и по кнопке) облако перечитывается: если в нём версия, которой
//    это устройство не видело (её записали с другого устройства), запись не выполняется;
//  - пока игрок не выбрал «взять из облака» или «оставить это устройство», в облако ничего не пишется;
//  - пустое устройство в облако не пишется никогда;
//  - если устройство с последней синхронизации не менялось, а в облаке новее, облако берётся без вопросов.

import { CloudError } from './cloud_yandex.js';
import { hasValidToken, planSync, canSaveNow } from './cloud_policy.js';

const ERROR_TEXTS = {
  unauthorized: 'Вход через Яндекс устарел. Войдите снова: данные на устройстве целы.',
  forbidden: 'У приложения нет доступа к папке на Диске. Войдите снова и разрешите доступ.',
  quota: 'На Яндекс Диске не хватает места.',
  rate: 'Яндекс просит подождать. Попробуйте чуть позже.',
  server: 'Яндекс Диск временно недоступен.',
  network: 'Нет связи с Яндекс Диском.',
  timeout: 'Яндекс Диск не ответил вовремя.',
  bad_response: 'Яндекс Диск ответил неожиданно. Попробуйте позже.',
  too_large: 'Копия в облаке слишком большая.',
  bad_file: 'Копия в облаке не распознана. «Сохранить сейчас» заменит её данными этого устройства.',
  empty: 'Пока нечего сохранять: сыграйте партию или решите несколько ситуаций.',
  pending: 'Сначала выберите, какие данные оставить.',
  throttled: 'Копия была записана совсем недавно.',
  busy: 'Запись уже идёт.',
  restored: 'В облаке была более новая копия, данные обновлены.',
  apply: 'Не удалось применить копию из облака.',
};

/** Короткий понятный текст для кода ошибки (неизвестный код → общий текст). */
export function errorText(code) {
  return ERROR_TEXTS[code] || 'Не удалось связаться с Яндекс Диском.';
}

/** Токен больше не годится: нужен повторный вход. */
const AUTH_CODES = new Set(['unauthorized', 'forbidden']);

/**
 * @param {object} deps
 * @param {(token: string) => {saveBackup(text: string): Promise<void>, loadBackup(): Promise<string>}} deps.makeClient
 * @param {() => object} deps.getState        sanitizeCloudState-совместимое состояние
 * @param {(state: object) => void} deps.setState
 * @param {() => {text: string, exportedAt: number, hash: string, summary: object}} deps.snapshot  копия данных устройства
 * @param {(text: string) => {ok: boolean, exportedAt?: number|null, summary?: object}} deps.parseText  разбор копии (без записи)
 * @param {(text: string) => {ok: boolean}} deps.applyText  записать копию на устройство
 * @param {() => boolean} deps.isLocalEmpty
 * @param {() => number} [deps.now]
 */
export function createCloudSync(deps) {
  const { makeClient, getState, setState, snapshot, parseText, applyText, isLocalEmpty } = deps;
  const now = deps.now || Date.now;

  let pending = null;       // { mode: 'offer'|'ask', cloudAt, text, cloud, local } — ждём выбора игрока
  let lastSaveAt = null;
  let lastError = null;     // код последней ошибки (для показа), null — всё в порядке
  let busy = false;

  const connected = () => hasValidToken(getState(), now());

  function fail(e) {
    const code = e instanceof CloudError ? e.code : 'network';
    lastError = code;
    if (AUTH_CODES.has(code)) setState({ ...getState(), expiresAt: 0 });   // токен остаётся, вход «устарел»
    return { ok: false, code };
  }

  /** Состояние для интерфейса. */
  function status() {
    const s = getState();
    const valid = hasValidToken(s, now());
    return {
      connected: valid,
      expired: !!s.token && !valid,
      syncedAt: s.syncedExportedAt,
      pending: pending ? { mode: pending.mode, cloudAt: pending.cloudAt, cloud: pending.cloud, local: pending.local } : null,
      error: lastError,
    };
  }

  /** Читает облако: { ok, cloudAt (null — файла нет), text, summary } или { ok: false, code }. */
  async function readCloud() {
    let text = null;
    try {
      text = await makeClient(getState().token).loadBackup();
    } catch (e) {
      if (!(e instanceof CloudError && e.code === 'not_found')) return fail(e);
    }
    if (text === null) return { ok: true, cloudAt: null, text: null, summary: null };
    const r = parseText(text);
    if (!r.ok || r.exportedAt == null) { lastError = 'bad_file'; return { ok: false, code: 'bad_file' }; }
    return { ok: true, cloudAt: r.exportedAt, text, summary: r.summary || null };
  }

  /** Заменить данные устройства копией из облака и запомнить версию. */
  function applyCloud(cloud) {
    const r = applyText(cloud.text);
    if (!r.ok) { lastError = 'apply'; return { ok: false, code: 'apply' }; }
    setState({ ...getState(), syncedExportedAt: cloud.cloudAt, syncedHash: snapshot().hash });
    pending = null;
    lastError = null;
    return { ok: true };
  }

  /**
   * Что делать с прочитанным облаком. Ставит pending, если нужен выбор игрока.
   * @returns {{kind: 'none'|'offer'|'ask'|'auto'|'error', upload?: boolean, code?: string}}
   */
  function evaluate(cloud) {
    const st = getState();
    const snap = snapshot();
    const plan = planSync({
      localEmpty: isLocalEmpty(),
      cloudExportedAt: cloud.cloudAt,
      syncedExportedAt: st.syncedExportedAt,
      localChanged: !(st.syncedHash && st.syncedHash === snap.hash),
    });
    lastError = null;
    if (plan.restore === 'auto') {
      const r = applyCloud(cloud);
      return r.ok ? { kind: 'auto' } : { kind: 'error', code: r.code };
    }
    if (plan.restore !== 'none') {
      pending = { mode: plan.restore, cloudAt: cloud.cloudAt, text: cloud.text, cloud: cloud.summary, local: snap.summary };
      return { kind: plan.restore };
    }
    pending = null;
    return { kind: 'none', upload: plan.upload };
  }

  /**
   * Чтение облака при запуске (и после входа).
   * @returns {Promise<{kind: 'no_auth'|'none'|'offer'|'ask'|'auto'|'error', code?: string}>}
   *   'auto' — устройство не менялось, данные заменены облачными: странице нужна перезагрузка.
   */
  async function check() {
    if (!connected()) return { kind: 'no_auth' };
    const cloud = await readCloud();
    if (!cloud.ok) return { kind: 'error', code: cloud.code };
    const r = evaluate(cloud);
    if (r.kind === 'none' && r.upload && cloud.cloudAt === null) {
      const w = await saveNow({ verified: true });
      if (!w.ok && w.code !== 'throttled') return { kind: 'error', code: w.code };
    }
    return { kind: r.kind, code: r.code };
  }

  /**
   * Записать копию в облако.
   * @param {{manual?: boolean, verified?: boolean}} opts
   *   manual   — по кнопке: пропускает только ограничение частоты;
   *   verified — облако только что прочитано и сверено, повторно не читать
   * @returns {Promise<{ok: true, at: number} | {ok: false, code: string}>}
   *   code 'pending' — в облаке чужая версия, нужен выбор; 'restored' — данные заменены облачными (перезагрузить страницу)
   */
  async function saveNow({ manual = false, verified = false } = {}) {
    if (!connected()) return { ok: false, code: 'unauthorized' };
    if (pending) return { ok: false, code: 'pending' };
    if (busy) return { ok: false, code: 'busy' };
    if (!manual && !canSaveNow({ now: now(), lastSaveAt })) return { ok: false, code: 'throttled' };
    if (isLocalEmpty()) return { ok: false, code: 'empty' };
    busy = true;
    try {
      if (!verified) {
        const cloud = await readCloud();
        // Повреждённый файл в облаке читать нечем: по кнопке его можно заменить, автоматически нет
        if (!cloud.ok && !(manual && cloud.code === 'bad_file')) return { ok: false, code: cloud.code };
        const r = cloud.ok ? evaluate(cloud) : { kind: 'none' };
        if (r.kind === 'auto') return { ok: false, code: 'restored' };
        if (r.kind === 'offer' || r.kind === 'ask') return { ok: false, code: 'pending' };
        if (r.kind === 'error') return { ok: false, code: r.code };
      }
      const snap = snapshot();
      await makeClient(getState().token).saveBackup(snap.text);
      lastSaveAt = now();
      lastError = null;
      setState({ ...getState(), syncedExportedAt: snap.exportedAt, syncedHash: snap.hash });
      return { ok: true, at: snap.exportedAt };
    } catch (e) {
      return fail(e);
    } finally {
      busy = false;
    }
  }

  /** Партия закончилась: сверяемся с облаком и пишем. */
  function afterGame() {
    return saveNow();
  }

  /** «Взять из облака»: данные устройства заменяются копией. Страницу после этого нужно перезагрузить. */
  function restore() {
    if (!pending) return { ok: false, code: 'pending' };
    return applyCloud(pending);
  }

  /** «Оставить это устройство»: облако заменяется данными устройства. */
  async function keepLocal() {
    if (!pending) return { ok: false, code: 'pending' };
    const cloudAt = pending.cloudAt;
    pending = null;
    setState({ ...getState(), syncedExportedAt: cloudAt, syncedHash: '' });
    return saveNow({ manual: true, verified: true });
  }

  /** «Выйти»: токен удаляется, данные устройства не трогаются. */
  function logout() {
    setState({ token: '', expiresAt: 0, syncedExportedAt: null, syncedHash: '' });
    pending = null;
    lastError = null;
    lastSaveAt = null;
  }

  return { status, check, saveNow, afterGame, restore, keepLocal, logout };
}
