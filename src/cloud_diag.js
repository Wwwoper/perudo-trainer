// cloud_diag.js — отчёт о связи с Яндекс Диском для случая, когда копия не читается.
//
// Нужен, когда браузер сообщает только «Load failed»: так выглядят и обрыв сети, и блокировка по CORS,
// и редирект. Отчёт проверяет каждый шаг по отдельности и несколькими способами, чтобы по нему
// можно было понять причину, не открывая консоль (на телефоне её нет).
//
// В отчёт не попадают токен и подписанная ссылка на файл (она даёт доступ к копии): только хост
// и имена параметров. Все внешние зависимости передаются снаружи, модуль проверяется в Node.

import { API, BACKUP_PATH } from './cloud_yandex.js';

const PROBE_MS = 15_000;

/** Хосты, достижимость которых проверяется без CORS: показывают, блокируется ли конкретный домен или весь интернет. */
export const REACH_URLS = [
  'https://yandex.ru/favicon.ico',
  'https://downloader.disk.yandex.ru/',
  'https://uploader.disk.yandex.net/',
  'https://www.gstatic.com/generate_204',
];

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return '?'; }
}

function paramNames(url) {
  try { return [...new URL(url).searchParams.keys()].join(','); } catch (e) { return ''; }
}

const msg = (e) => `${e?.name || 'Error'}: ${e?.message || ''}`.trim();

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {string} deps.token
 * @param {(url: string, ms: number) => Promise<{status: number, host: string}>} [deps.xhrProbe] проба через XMLHttpRequest
 * @param {{userAgent?: string, online?: boolean, origin?: string, now?: string}} [deps.env]
 * @returns {Promise<string[]>} строки отчёта
 */
export async function runDiagnostics({ fetch: doFetch, token, xhrProbe = null, env = {} }) {
  const out = [];
  const say = (line) => out.push(line);

  /** Один запрос с тайм-аутом; результат — строка для отчёта. */
  async function probe(name, url, init = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PROBE_MS);
    try {
      const res = await doFetch(url, { ...init, signal: ctl.signal });
      const parts = [`status=${res.status}`, `type=${res.type}`];
      if (res.redirected) parts.push(`redirected→${hostOf(res.url)}`);
      let ct = '';
      try { ct = res.headers?.get?.('content-type') || ''; } catch (e) { /* заголовок недоступен */ }
      if (ct) parts.push(`content-type=${ct}`);
      say(`${name}: ${parts.join(' ')}`);
      return res;
    } catch (e) {
      say(`${name}: ОШИБКА ${msg(e)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  say(`Время: ${env.now || new Date().toISOString()}`);
  say(`Браузер: ${env.userAgent || '?'}`);
  say(`Сеть (navigator.onLine): ${env.online}`);
  say(`Страница: ${env.origin || '?'}`);

  const auth = { headers: { Authorization: `OAuth ${token}` } };
  const q = encodeURIComponent(BACKUP_PATH);

  await probe('1. список папки приложения (cloud-api)', `${API}/resources?path=${encodeURIComponent('app:/')}&limit=1`, auth);

  const linkRes = await probe('2. ссылка на скачивание (cloud-api)', `${API}/resources/download?path=${q}`, auth);
  let href = '';
  if (linkRes?.ok) {
    try { href = (await linkRes.clone().json()).href || ''; } catch (e) { say('2. ссылка: ответ не JSON'); }
  }

  if (href) {
    say(`   адрес файла: хост ${hostOf(href)}, параметры: ${paramNames(href)}`);
    await probe('3. файл: fetch (cors)', href, { mode: 'cors' });
    await probe('4. файл: fetch без referrer', href, { mode: 'cors', referrerPolicy: 'no-referrer', cache: 'no-store', credentials: 'omit' });
    const manual = await probe('5. файл: fetch redirect=manual', href, { redirect: 'manual' });
    if (manual?.type === 'opaqueredirect') say('   → сервер отвечает редиректом (браузер не показывает куда)');
    await probe('6. файл: fetch no-cors', href, { mode: 'no-cors', cache: 'no-store' });
    if (typeof xhrProbe === 'function') {
      try {
        const r = await xhrProbe(href, PROBE_MS);
        say(`7. файл: XMLHttpRequest: status=${r.status}${r.host && r.host !== hostOf(href) ? ` redirected→${r.host}` : ''}`);
      } catch (e) {
        say(`7. файл: XMLHttpRequest: ОШИБКА ${msg(e)}`);
      }
    }
  } else {
    say('   файл не проверен: ссылки нет (файла нет на Диске или токен не подходит)');
  }

  say('Достижимость хостов без CORS:');
  for (const url of REACH_URLS) await probe(`   ${hostOf(url)}`, url, { mode: 'no-cors', cache: 'no-store' });

  return out;
}
