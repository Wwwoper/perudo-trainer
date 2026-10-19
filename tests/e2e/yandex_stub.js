// tests/e2e/yandex_stub.js
// Подменённый Яндекс для e2e: вход (OAuth), API Диска и хосты загрузки/скачивания. В настоящий Яндекс тесты не ходят.
export const TOKEN = 'y0_test_token_0123456789';
export const OLD = 1_700_000_000_000;
export const cloudFile = (data, at = OLD) => JSON.stringify({ format: 'perudo-backup', version: 2, exportedAt: at, data });
export const progress = (n) => ({ n: 0, good: 0, totalGames: n, totalWins: 0, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } });

/** Подменяет Яндекс: вход, API Диска и хосты загрузки/скачивания. mode: 'ok' | 401 | 'offline'. */
export async function stubYandex(page, { text = null, mode = 'ok' } = {}) {
  const cloud = { text, puts: 0, logins: 0, mode, downloadFails: 0 };   // downloadFails: сколько запросов файла оборвать подряд       // mode можно менять по ходу теста: 'ok' | 401 | 'offline'
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('https://oauth.yandex.ru/**', (route) => {
    cloud.logins++;
    const u = new URL(route.request().url());
    const back = `${u.searchParams.get('redirect_uri')}#access_token=${TOKEN}&token_type=bearer&expires_in=31536000&state=${u.searchParams.get('state')}`;
    route.fulfill({ status: 302, headers: { location: back } });
  });
  await page.route('https://cloud-api.yandex.net/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (cloud.mode === 'offline') return route.abort('failed');
    if (cloud.mode === 401) return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{}' });
    const u = new URL(req.url());
    if (u.pathname.endsWith('/resources/download') && cloud.text === null) {
      return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
    }
    const host = u.pathname.endsWith('/resources/upload') ? 'uploader' : 'downloader';
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ href: `https://${host}.stub.test/file` }) });
  });
  await page.route('https://uploader.stub.test/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    cloud.text = req.postData();
    cloud.puts++;
    return route.fulfill({ status: 201, headers: cors, body: '' });
  });
  await page.route('https://downloader.stub.test/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (cloud.downloadFails > 0) { cloud.downloadFails--; return route.abort('failed'); }
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: cloud.text });
  });
  // хосты проб диагностики: в настоящий интернет тесты не ходят
  await page.route(/^https:\/\/(yandex\.ru|www\.gstatic\.com|uploader\.disk\.yandex\.net|downloader\.disk\.yandex\.ru)\//, (route) => route.fulfill({ status: 204, headers: cors }));
  return cloud;
}

/** Кладёт в хранилище данные партий, вход (если нужен) и перезагружает страницу. */
export async function seed(page, { games = 0, signedIn = true, synced = null, extra = {}, account = undefined } = {}) {
  await page.evaluate(([g, tok, sy, ex, t, acc]) => {
    localStorage.clear();
    if (g) localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 0, good: 0, totalGames: g, totalWins: 0, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
    for (const [k, v] of Object.entries(ex)) localStorage.setItem(k, JSON.stringify(v));
    if (acc !== null) localStorage.setItem('perudo.device', JSON.stringify({ nextAt: 5, persistTries: 2, account: acc || (tok ? 'yandex' : 'guest') }));
    if (tok) localStorage.setItem('perudo.cloud', JSON.stringify({ token: t, expiresAt: Date.now() + 86_400_000, syncedExportedAt: sy }));
  }, [games, signedIn, synced, extra, TOKEN, account === undefined ? '' : account]);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__perudo_v2));
}
