// cloud_sync.js — сценарии облачной копии: запуск, запись после партии, восстановление, выход.
//
// Модуль не знает ни про браузер, ни про интерфейс: всё внешнее передаётся снаружи
// (клиент Диска, чтение и запись состояния, снимок данных, проверка «данных нет»).
// Поэтому все ветки проверяются в Node на поддельных зависимостях.
//
// Главное правило безопасности данных: пока игрок не выбрал «восстановить» или «оставить это
// устройство», в облако ничего не пишется, а пустое устройство в облако не пишется никогда.

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
 * @param {() => {text: string, exportedAt: number}} deps.snapshot  копия данных устройства
 * @param {(text: string) => {ok: boolean, exportedAt?: number|null}} deps.parseText  разбор копии (без записи)
 * @param {(text: string) => {ok: boolean}} deps.applyText  записать копию на устройство
 * @param {() => boolean} deps.isLocalEmpty
 * @param {() => number} [deps.now]
 */
export function createCloudSync(deps) {
  const { makeClient, getState, setState, snapshot, parseText, applyText, isLocalEmpty } = deps;
  const now = deps.now || Date.now;

  let pending = null;       // { mode: 'offer'|'ask', cloudAt, text } — ждём выбора игрока
  let checkedOk = false;    // облако прочитано и расхождений нет
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
      pending: pending ? { mode: pending.mode, cloudAt: pending.cloudAt } : null,
      error: lastError,
    };
  }

  /**
   * Чтение облака при запуске (и после входа).
   * @returns {Promise<{kind: 'no_auth'|'none'|'offer'|'ask'|'error', code?: string}>}
   */
  async function check() {
    if (!connected()) return { kind: 'no_auth' };
    let text = null;
    try {
      text = await makeClient(getState().token).loadBackup();
    } catch (e) {
      if (!(e instanceof CloudError && e.code === 'not_found')) { checkedOk = false; return { kind: 'error', code: fail(e).code }; }
    }
    let cloudAt = null;
    if (text !== null) {
      const r = parseText(text);
      if (!r.ok || r.exportedAt == null) { checkedOk = false; lastError = 'bad_file'; return { kind: 'error', code: 'bad_file' }; }
      cloudAt = r.exportedAt;
    }
    const plan = planSync({
      localEmpty: isLocalEmpty(),
      cloudExportedAt: cloudAt,
      syncedExportedAt: getState().syncedExportedAt,
    });
    lastError = null;
    if (plan.restore !== 'none') {
      pending = { mode: plan.restore, cloudAt, text };
      checkedOk = false;
      return { kind: plan.restore };
    }
    pending = null;
    checkedOk = true;
    if (plan.upload && cloudAt === null) {
      const r = await saveNow();
      if (!r.ok && r.code !== 'throttled') return { kind: 'error', code: r.code };
    }
    return { kind: 'none' };
  }

  /**
   * Записать копию в облако.
   * @param {{manual?: boolean}} opts manual — по кнопке: пропускает только ограничение частоты
   */
  async function saveNow({ manual = false } = {}) {
    if (!connected()) return { ok: false, code: 'unauthorized' };
    if (pending) return { ok: false, code: 'pending' };
    if (busy) return { ok: false, code: 'busy' };
    if (!manual && !canSaveNow({ now: now(), lastSaveAt })) return { ok: false, code: 'throttled' };
    if (isLocalEmpty()) return { ok: false, code: 'empty' };
    busy = true;
    try {
      const snap = snapshot();
      await makeClient(getState().token).saveBackup(snap.text);
      lastSaveAt = now();
      lastError = null;
      checkedOk = true;
      setState({ ...getState(), syncedExportedAt: snap.exportedAt });
      return { ok: true, at: snap.exportedAt };
    } catch (e) {
      return fail(e);
    } finally {
      busy = false;
    }
  }

  /** Партия закончилась: при необходимости сверяемся с облаком, затем пишем. */
  async function afterGame() {
    if (!connected()) return { ok: false, code: 'unauthorized' };
    if (!checkedOk) {
      const r = await check();
      if (r.kind === 'error') return { ok: false, code: r.code };
      if (r.kind === 'offer' || r.kind === 'ask') return { ok: false, code: 'pending' };
    }
    return saveNow();
  }

  /** «Взять из облака»: данные устройства заменяются копией. Страницу после этого нужно перезагрузить. */
  function restore() {
    if (!pending) return { ok: false, code: 'pending' };
    const r = applyText(pending.text);
    if (!r.ok) { lastError = 'apply'; return { ok: false, code: 'apply' }; }
    setState({ ...getState(), syncedExportedAt: pending.cloudAt });
    pending = null;
    checkedOk = true;
    lastError = null;
    return { ok: true };
  }

  /** «Оставить это устройство»: облако заменяется данными устройства. */
  async function keepLocal() {
    if (!pending) return { ok: false, code: 'pending' };
    const cloudAt = pending.cloudAt;
    pending = null;
    setState({ ...getState(), syncedExportedAt: cloudAt });
    checkedOk = true;
    const r = await saveNow({ manual: true });
    if (!r.ok) { pending = null; checkedOk = false; }
    return r;
  }

  /** «Выйти»: токен удаляется, данные устройства не трогаются. */
  function logout() {
    setState({ token: '', expiresAt: 0, syncedExportedAt: null });
    pending = null;
    checkedOk = false;
    lastError = null;
    lastSaveAt = null;
  }

  return { status, check, saveNow, afterGame, restore, keepLocal, logout };
}
