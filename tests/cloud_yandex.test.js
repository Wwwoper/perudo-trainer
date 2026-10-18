// cloud_yandex.test.js — клиент Яндекс Диска на поддельном fetch (src/cloud_yandex.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  YANDEX_CLIENT_ID, API, BACKUP_PATH, CloudError,
  redirectUriFor, createState, buildAuthUrl, parseAuthHash, createClient,
} from '../src/cloud_yandex.js';

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const fail = (status) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

/** Поддельный fetch: ответы по порядку вызовов, все вызовы записываются. */
function fakeFetch(...responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = responses[calls.length - 1];
    if (r instanceof Error) throw r;
    return r;
  };
  f.calls = calls;
  return f;
}

describe('redirectUriFor', () => {
  it('адрес страницы без index.html', () => {
    assert.equal(redirectUriFor({ origin: 'https://wwwoper.github.io', pathname: '/perudo-trainer/index.html' }), 'https://wwwoper.github.io/perudo-trainer/');
    assert.equal(redirectUriFor({ origin: 'https://wwwoper.github.io', pathname: '/perudo-trainer/' }), 'https://wwwoper.github.io/perudo-trainer/');
    assert.equal(redirectUriFor({ origin: 'http://localhost:8000', pathname: '/' }), 'http://localhost:8000/');
  });
});

describe('createState / buildAuthUrl', () => {
  it('state из байтов, одинаковой длины', () => {
    assert.equal(createState([0, 255, 16]), '00ff10');
    assert.equal(createState(new Uint8Array(16)).length, 32);
  });
  it('адрес входа: тип ответа token, ClientID приложения, возврат и state', () => {
    const u = new URL(buildAuthUrl({ redirectUri: 'https://wwwoper.github.io/perudo-trainer/', state: 'abc' }));
    assert.equal(u.origin + u.pathname, 'https://oauth.yandex.ru/authorize');
    assert.equal(u.searchParams.get('response_type'), 'token');
    assert.equal(u.searchParams.get('client_id'), YANDEX_CLIENT_ID);
    assert.equal(u.searchParams.get('redirect_uri'), 'https://wwwoper.github.io/perudo-trainer/');
    assert.equal(u.searchParams.get('state'), 'abc');
  });
  it('ClientID приложения — тот, что указан в Яндексе', () => {
    assert.equal(YANDEX_CLIENT_ID, '2e39f9a52ab94c12b9fd9634747c35ac');
  });
});

describe('parseAuthHash', () => {
  const now = 1_000_000;
  it('успешный ответ: токен и срок', () => {
    const r = parseAuthHash('#access_token=TOK123&token_type=bearer&expires_in=31536000&state=s1', { expectedState: 's1', now });
    assert.deepEqual(r, { ok: true, token: 'TOK123', expiresAt: now + 31536000 * 1000 });
  });
  it('чужой state отклоняется', () => {
    assert.deepEqual(parseAuthHash('#access_token=T&state=evil', { expectedState: 's1', now }), { ok: false, error: 'state' });
    assert.deepEqual(parseAuthHash('#access_token=T', { expectedState: 's1', now }), { ok: false, error: 'state' });
  });
  it('отказ игрока', () => {
    assert.deepEqual(parseAuthHash('#error=access_denied&error_description=x', { now }), { ok: false, error: 'denied' });
  });
  it('обычная загрузка без ответа Яндекса', () => {
    for (const h of ['', '#', '#section', '#foo=bar', undefined, null]) assert.deepEqual(parseAuthHash(h, { now }), { ok: false, error: 'none' }, String(h));
  });
  it('пустой токен', () => {
    assert.deepEqual(parseAuthHash('#access_token=&expires_in=5', { now }), { ok: false, error: 'no_token' });
  });
  it('нет срока — срок 0 (считается истёкшим)', () => {
    assert.equal(parseAuthHash('#access_token=T', { now }).expiresAt, now);
    assert.equal(parseAuthHash('#access_token=T&expires_in=abc', { now }).expiresAt, now);
  });
});

describe('saveBackup', () => {
  it('два шага: ссылка с overwrite, затем PUT текста на неё без заголовка авторизации', async () => {
    const f = fakeFetch(ok({ href: 'https://uploader.disk.yandex.net/x', method: 'PUT' }), ok('', 201));
    await createClient({ fetch: f, token: 'TOK' }).saveBackup('{"a":1}');
    assert.equal(f.calls.length, 2);
    const first = f.calls[0];
    assert.equal(first.url, `${API}/resources/upload?path=${encodeURIComponent(BACKUP_PATH)}&overwrite=true`);
    assert.equal(first.init.headers.Authorization, 'OAuth TOK');
    const second = f.calls[1];
    assert.equal(second.url, 'https://uploader.disk.yandex.net/x');
    assert.equal(second.init.method, 'PUT');
    assert.equal(second.init.body, '{"a":1}');
    assert.ok(!second.init.headers?.Authorization, 'токен на адрес загрузки не отправляется');
  });
  it('принимает 202 (загрузка принята)', async () => {
    const f = fakeFetch(ok({ href: 'https://u.example/x' }), ok('', 202));
    await createClient({ fetch: f, token: 'T' }).saveBackup('x');
  });
  it('пустой текст — ошибка программиста', async () => {
    await assert.rejects(createClient({ fetch: fakeFetch(), token: 'T' }).saveBackup(''), TypeError);
  });
  it('ответ без ссылки или с небезопасной ссылкой — bad_response', async () => {
    for (const body of [{}, { href: 5 }, { href: 'http://insecure.example/x' }, { href: 'javascript:alert(1)' }]) {
      await assert.rejects(createClient({ fetch: fakeFetch(ok(body)), token: 'T' }).saveBackup('x'),
        (e) => e instanceof CloudError && e.code === 'bad_response', JSON.stringify(body));
    }
  });
  it('обрыв на втором шаге — код ошибки по статусу', async () => {
    const f = fakeFetch(ok({ href: 'https://u.example/x' }), fail(507));
    await assert.rejects(createClient({ fetch: f, token: 'T' }).saveBackup('x'), (e) => e.code === 'quota');
  });
});

describe('loadBackup', () => {
  it('ссылка на скачивание, затем текст', async () => {
    const f = fakeFetch(ok({ href: 'https://downloader.disk.yandex.ru/d' }), ok('{"format":"perudo-backup"}'));
    const text = await createClient({ fetch: f, token: 'T' }).loadBackup();
    assert.equal(text, '{"format":"perudo-backup"}');
    assert.equal(f.calls[0].url, `${API}/resources/download?path=${encodeURIComponent(BACKUP_PATH)}`);
    assert.ok(!f.calls[1].init.headers?.Authorization);
  });
  it('файла нет — not_found', async () => {
    await assert.rejects(createClient({ fetch: fakeFetch(fail(404)), token: 'T' }).loadBackup(), (e) => e.code === 'not_found');
  });
  it('слишком большой файл — too_large', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024 + 1);
    const f = fakeFetch(ok({ href: 'https://d.example/x' }), ok(big));
    await assert.rejects(createClient({ fetch: f, token: 'T' }).loadBackup(), (e) => e.code === 'too_large');
  });
});

describe('коды ошибок', () => {
  const codeFor = async (res) => {
    try { await createClient({ fetch: fakeFetch(res), token: 'T' }).loadBackup(); } catch (e) { return e.code; }
    return null;
  };
  it('по статусу ответа', async () => {
    assert.equal(await codeFor(fail(401)), 'unauthorized');
    assert.equal(await codeFor(fail(403)), 'forbidden');
    assert.equal(await codeFor(fail(404)), 'not_found');
    assert.equal(await codeFor(fail(429)), 'rate');
    assert.equal(await codeFor(fail(507)), 'quota');
    assert.equal(await codeFor(fail(500)), 'server');
    assert.equal(await codeFor(fail(503)), 'server');
    assert.equal(await codeFor(fail(418)), 'bad_response');
  });
  it('сбой сети и тайм-аут', async () => {
    assert.equal(await codeFor(new TypeError('Failed to fetch')), 'network');
    assert.equal(await codeFor(Object.assign(new Error('aborted'), { name: 'AbortError' })), 'timeout');
  });
  it('ответ не JSON — bad_response', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } };
    assert.equal(await codeFor(res), 'bad_response');
  });
  it('зависший запрос обрывается по тайм-ауту', async () => {
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))));
    await assert.rejects(createClient({ fetch: hang, token: 'T', timeoutMs: 20 }).loadBackup(), (e) => e.code === 'timeout');
  });
  it('нужен fetch', () => assert.throws(() => createClient({ token: 'T' }), TypeError));
});
