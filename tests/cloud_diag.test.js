// cloud_diag.test.js — отчёт о связи с Яндекс Диском (src/cloud_diag.js) на поддельном fetch
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runDiagnostics, REACH_URLS } from '../src/cloud_diag.js';

const TOKEN = 'y0_SECRET_TOKEN_0123456789';
const SIGNED = 'https://downloader.disk.yandex.ru/disk/SECRETHASH/file?uid=1&hash=SECRET&limit=0';

const res = (extra = {}) => ({ ok: true, status: 200, type: 'cors', redirected: false, url: '', headers: { get: () => 'application/json' }, clone() { return this; }, json: async () => ({ href: SIGNED }), ...extra });

/** fetch по правилам: функция (url, init) → ответ или исключение. */
function router(rule) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    return rule(url, init);
  };
  f.calls = calls;
  return f;
}

const env = { userAgent: 'TestUA/1.0', online: true, origin: 'https://wwwoper.github.io', now: '2026-10-19T10:00:00Z' };

describe('runDiagnostics', () => {
  it('всё работает: отчёт содержит все шаги, хосты и окружение', async () => {
    const f = router(() => res());
    const lines = await runDiagnostics({ fetch: f, token: TOKEN, env, xhrProbe: async () => ({ status: 200, host: 'downloader.disk.yandex.ru' }) });
    const text = lines.join('\n');
    for (const part of ['TestUA/1.0', 'navigator.onLine', 'wwwoper.github.io', '1. список папки', '2. ссылка', '3. файл: fetch (cors)', '4. файл: fetch без referrer',
      '5. файл: fetch redirect=manual', '6. файл: fetch no-cors', '7. файл: XMLHttpRequest: status=200', 'Достижимость']) assert.ok(text.includes(part), part);
    for (const url of REACH_URLS) assert.ok(text.includes(new URL(url).host), url);
  });

  it('токен и подписанная ссылка в отчёт не попадают, только хост и имена параметров', async () => {
    const lines = await runDiagnostics({ fetch: router(() => res()), token: TOKEN, env });
    const text = lines.join('\n');
    assert.ok(!text.includes('SECRET'));
    assert.ok(!text.includes(TOKEN));
    assert.ok(text.includes('хост downloader.disk.yandex.ru, параметры: uid,hash,limit'));
  });

  it('сбой на втором шаге: ошибки показаны по каждому способу, отчёт не падает', async () => {
    const f = router((url, init) => {
      if (url.includes('cloud-api')) return res();
      if (init.mode === 'no-cors' && url.startsWith('https://yandex.ru')) return res({ type: 'opaque', status: 0 });
      throw new TypeError('Load failed');
    });
    const lines = await runDiagnostics({ fetch: f, token: TOKEN, env, xhrProbe: async () => { throw new Error('xhr error'); } });
    const text = lines.join('\n');
    assert.match(text, /3\. файл: fetch \(cors\): ОШИБКА TypeError: Load failed/);
    assert.match(text, /6\. файл: fetch no-cors: ОШИБКА/);
    assert.match(text, /7\. файл: XMLHttpRequest: ОШИБКА Error: xhr error/);
    assert.match(text, /yandex\.ru: status=0 type=opaque/);
    assert.match(text, /gstatic\.com: ОШИБКА/);
  });

  it('редирект распознаётся по opaqueredirect', async () => {
    const f = router((url, init) => (init.redirect === 'manual' ? res({ type: 'opaqueredirect', status: 0 }) : res()));
    const text = (await runDiagnostics({ fetch: f, token: TOKEN, env })).join('\n');
    assert.match(text, /сервер отвечает редиректом/);
  });

  it('файла на Диске нет: второй шаг пропущен, сказано почему', async () => {
    const f = router((url) => (url.includes('/resources/download') ? res({ ok: false, status: 404 }) : res()));
    const text = (await runDiagnostics({ fetch: f, token: TOKEN, env })).join('\n');
    assert.match(text, /файл не проверен: ссылки нет/);
    assert.ok(!text.includes('3. файл'));
  });

  it('токен передаётся только запросам к cloud-api, файловые запросы без Authorization', async () => {
    const f = router(() => res());
    await runDiagnostics({ fetch: f, token: TOKEN, env });
    for (const c of f.calls) {
      const hasAuth = !!c.init.headers?.Authorization;
      assert.equal(hasAuth, c.url.startsWith('https://cloud-api.yandex.net'), c.url);
    }
  });

  it('зависший запрос обрывается по тайм-ауту и не блокирует отчёт', async () => {
    let n = 0;
    const f = router((url, init) => {
      if (url.includes('cloud-api')) return res();
      n++;
      return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    });
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms > 1000 ? 5 : ms, ...a);
    try {
      const text = (await runDiagnostics({ fetch: f, token: TOKEN, env })).join('\n');
      assert.match(text, /AbortError/);
      assert.ok(n >= 4);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });
});
