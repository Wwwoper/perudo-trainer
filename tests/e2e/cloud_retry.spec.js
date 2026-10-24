// tests/e2e/cloud_retry.spec.js
// Сбой при проверке облака (нет связи) и повторная проверка. Яндекс подменён заглушкой.
import { test, expect } from './fixtures.js';
import { openTab as goTab, openStatsTab } from './helpers.js';
import { stubYandex, seed, cloudFile, progress } from './yandex_stub.js';

test.describe('Облако: сбой проверки и повтор', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('нет связи при проверке: статус честный, есть подробности и «Проверить снова»', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }), mode: 'offline' });
    await seed(page, { games: 0 });
    await expect(page.locator('#clToast')).toContainText('Нет связи');
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#clStatus')).toContainText('Не удалось проверить копию');
    await expect(page.locator('#clStatus')).not.toContainText('ещё не записана');
    await expect(page.locator('.cloud-detail')).toContainText('cloud-api.yandex.net');
    await expect(page.locator('#clCheck')).toBeVisible();
    cloud.mode = 'ok';
    await page.locator('#clCheck').click();
    await expect(page.locator('#clDialogTitle')).toHaveText('Найдена копия данных');
    await expect(page.locator('#clCheck')).toHaveCount(0);
  });

  test('ошибка не исчезает сама; её закрывают кнопкой «✕» или Esc; уведомление не перекрывает шапку', async ({ page }) => {
    await page.clock.install();
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }), mode: 'offline' });
    await seed(page, { games: 0 });
    const toast = page.locator('#clToast');
    await expect(toast).toContainText('Нет связи');
    const head = await page.locator('.app-header').boundingBox();
    const box = await toast.boundingBox();
    expect(box.y, 'уведомление не перекрывает шапку и вкладки').toBeGreaterThanOrEqual(head.y + head.height - 1);
    const close = await page.locator('#clToastClose').boundingBox();
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await page.clock.fastForward(15000);
    await expect(toast, 'ошибка остаётся, пока её не закроют').toBeVisible();
    await page.locator('#clToastClose').click();
    await expect(toast).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-h'))).toBe('');
  });

  test('Esc закрывает уведомление, если нет открытого окна', async ({ page }) => {
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }), mode: 'offline' });
    await seed(page, { games: 0 });
    await expect(page.locator('#clToast')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#clToast')).toBeHidden();
  });

  test('связь появилась (событие online): проверка повторяется сама', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }), mode: 'offline' });
    await seed(page, { games: 0 });
    await expect(page.locator('#clToast')).toContainText('Нет связи');
    cloud.mode = 'ok';
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('#clDialog')).toBeVisible();
  });

  test('пока облако не проверено, запись не идёт, а данные устройства целы', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(1) }), mode: 'offline' });
    await seed(page, { games: 3, synced: 1 });
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await page.locator('#clSave').click();
    await expect(page.locator('#clMsg')).toContainText('Нет связи');
    expect(cloud.puts).toBe(0);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.userProfile')))).totalGames).toBe(3);
  });

  test('после успешной проверки кнопки «Проверить снова» нет', async ({ page }) => {
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
    await seed(page, { games: 3, synced: 1_700_000_000_000 });
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#clStatus')).toContainText('Копия в облаке:');
    await expect(page.locator('#clCheck')).toHaveCount(0);
  });

  test('первая попытка скачать файл оборвалась: запасной способ получает копию, ошибки нет', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }) });
    cloud.downloadFails = 1;                                 // оборвать только первый запрос файла
    await seed(page, { games: 0 });
    await expect(page.locator('#clDialogTitle')).toHaveText('Найдена копия данных');
    await expect(page.locator('#clToast')).toBeHidden();
    expect(cloud.downloadFails).toBe(0);
  });

  test('как настоящий Яндекс: запрос файла с Referer получил бы 403, приложение шлёт без него и ни разу не получает отказ', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }) });
    cloud.strictReferer = true;
    await seed(page, { games: 0 });
    await expect(page.locator('#clDialogTitle')).toHaveText('Найдена копия данных');
    await expect(page.locator('#clToast')).toBeHidden();
    expect(cloud.withReferer).toBe(0);
  });

  test('файл не скачивается ничем: в подробностях все попытки, «Диагностика связи» собирает отчёт без токена', async ({ page }) => {
    const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }) });
    cloud.downloadFails = 99;
    await seed(page, { games: 0 });
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    const detail = page.locator('.cloud-detail');
    await expect(detail).toContainText('fetch без referrer');
    await expect(detail).toContainText('fetch:');
    await page.locator('#clDiag').click();
    const report = page.locator('#clDiagOut');
    await expect(report).toContainText('3. файл: fetch (cors): ОШИБКА');
    await expect(report).toContainText('7. файл: XMLHttpRequest: ОШИБКА');
    await expect(report).toContainText('Достижимость хостов');
    const text = await report.innerText();
    expect(text).not.toContain('y0_test_token');
    expect(text).not.toContain('stub.test/file');            // подписанная ссылка в отчёт не попадает
    await expect(page.locator('#clDiagCopy')).toBeVisible();
  });
});
