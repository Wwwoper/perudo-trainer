// cloud_yandex.js — копия данных в папке приложения на Яндекс Диске игрока.
//
// Модуль не обращается к браузеру напрямую: fetch и таймер передаются снаружи, поэтому его
// можно проверить в Node на поддельном fetch. Своего сервера у приложения нет: данные идут
// из браузера игрока на его же Диск, права токена — только на папку приложения
// (cloud_api:disk.app_folder).
//
// Загрузка и скачивание в API Диска двухшаговые: сначала запрос ссылки, потом передача файла
// на эту ссылку (отдельный адрес). Оба шага проверены из браузера с другого домена (CORS).

import { MAX_BACKUP_CHARS } from './backup.js';

/** Публичный идентификатор приложения (oauth.yandex.ru); не секрет. */
export const YANDEX_CLIENT_ID = '2e39f9a52ab94c12b9fd9634747c35ac';
export const API = 'https://cloud-api.yandex.net/v1/disk';
export const AUTH_URL = 'https://oauth.yandex.ru/authorize';
export const BACKUP_PATH = 'app:/perudo-backup.json';
export const REQUEST_TIMEOUT_MS = 20_000;

/** Ошибка облака. code: unauthorized | forbidden | not_found | quota | rate | server | network | timeout | bad_response | too_large. */
export class CloudError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CloudError';
    this.code = code;
  }
}

// ----- Вход -----

/** Адрес возврата: адрес страницы без хвоста index.html и без #/?, он должен совпадать с указанным в приложении Яндекса. */
export function redirectUriFor({ origin, pathname }) {
  const dir = String(pathname || '/').replace(/index\.html$/, '');
  return `${origin}${dir}`;
}

/** Случайная строка для защиты от подмены ответа (state); байты передаются снаружи. */
export function createState(bytes) {
  return Array.from(bytes, (b) => (b & 255).toString(16).padStart(2, '0')).join('');
}

export function buildAuthUrl({ clientId = YANDEX_CLIENT_ID, redirectUri, state }) {
  const u = new URL(AUTH_URL);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

/**
 * Разбирает часть адреса после «#», с которой Яндекс вернул игрока на страницу.
 * @returns {{ok: true, token: string, expiresAt: number} | {ok: false, error: 'none'|'denied'|'state'|'no_token'}}
 *   'none' — в адресе нет ответа Яндекса (обычная загрузка страницы), показывать ничего не нужно.
 */
export function parseAuthHash(hash, { expectedState, now = Date.now() } = {}) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { ok: false, error: 'none' };
  const p = new URLSearchParams(raw);
  if (p.has('error')) return { ok: false, error: 'denied' };
  if (!p.has('access_token')) return { ok: false, error: 'none' };
  if (expectedState && p.get('state') !== expectedState) return { ok: false, error: 'state' };
  const token = p.get('access_token');
  const sec = Number(p.get('expires_in'));
  if (!token) return { ok: false, error: 'no_token' };
  return { ok: true, token, expiresAt: now + (Number.isFinite(sec) && sec > 0 ? sec * 1000 : 0) };
}

// ----- Запросы -----

const STATUS_CODES = new Map([[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate'], [507, 'quota']]);

function errorFor(status) {
  return new CloudError(STATUS_CODES.get(status) || (status >= 500 ? 'server' : 'bad_response'), `HTTP ${status}`);
}

/**
 * @param {{fetch: typeof fetch, token: string, timeoutMs?: number}} deps
 */
export function createClient({ fetch: doFetch, token, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (typeof doFetch !== 'function') throw new TypeError('createClient: нужен fetch');

  /** Один запрос: сбой сети и тайм-аут превращаются в CloudError, статус не из 2xx — тоже. */
  async function call(url, init = {}, { auth = true } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const headers = auth ? { ...(init.headers || {}), Authorization: `OAuth ${token}` } : init.headers;
      const res = await doFetch(url, { ...init, headers, signal: ctl.signal });
      if (!res.ok) throw errorFor(res.status);
      return res;
    } catch (e) {
      if (e instanceof CloudError) throw e;
      throw new CloudError(e?.name === 'AbortError' ? 'timeout' : 'network', e?.message || '');
    } finally {
      clearTimeout(timer);
    }
  }

  const q = (path) => encodeURIComponent(path);

  async function link(kind, extra = '') {
    const res = await call(`${API}/resources/${kind}?path=${q(BACKUP_PATH)}${extra}`);
    let body;
    try { body = await res.json(); } catch (e) { throw new CloudError('bad_response', 'нет JSON'); }
    if (typeof body?.href !== 'string' || !body.href.startsWith('https://')) {
      throw new CloudError('bad_response', 'нет ссылки');
    }
    return body.href;
  }

  return {
    /** Записывает копию (текст JSON); существующая заменяется. */
    async saveBackup(text) {
      if (typeof text !== 'string' || !text) throw new TypeError('saveBackup: нужен непустой текст');
      const href = await link('upload', '&overwrite=true');
      const res = await call(href, { method: 'PUT', body: text }, { auth: false });
      if (res.status !== 201 && res.status !== 202 && res.status !== 200) throw errorFor(res.status);
    },

    /** Читает копию; если файла нет — CloudError с кодом not_found. */
    async loadBackup() {
      const href = await link('download');
      const res = await call(href, {}, { auth: false });
      const text = await res.text();
      if (text.length > MAX_BACKUP_CHARS) throw new CloudError('too_large');
      return text;
    },
  };
}
