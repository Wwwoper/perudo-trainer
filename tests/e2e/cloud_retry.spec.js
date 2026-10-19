// tests/e2e/cloud_retry.spec.js
// Сбой при проверке облака (нет связи) и повторная проверка. Яндекс подменён заглушкой.
import { test, expect } from './fixtures.js';
import { openTab as goTab } from './helpers.js';
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
    await expect(page.locator('#clStatus')).toContainText('Не удалось проверить копию');
    await expect(page.locator('#clStatus')).not.toContainText('ещё не записана');
    await expect(page.locator('.cloud-detail')).toContainText('cloud-api.yandex.net');
    await expect(page.locator('#clCheck')).toBeVisible();
    cloud.mode = 'ok';
    await page.locator('#clCheck').click();
    await expect(page.locator('#clDialogTitle')).toHaveText('Найдена копия данных');
    await expect(page.locator('#clCheck')).toHaveCount(0);
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
    await page.locator('#clSave').click();
    await expect(page.locator('#clMsg')).toContainText('Нет связи');
    expect(cloud.puts).toBe(0);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.userProfile')))).totalGames).toBe(3);
  });

  test('после успешной проверки кнопки «Проверить снова» нет', async ({ page }) => {
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
    await seed(page, { games: 3, synced: 1_700_000_000_000 });
    await goTab(page, 'stats');
    await expect(page.locator('#clStatus')).toContainText('Копия в облаке:');
    await expect(page.locator('#clCheck')).toHaveCount(0);
  });
});
