// tests/e2e/welcome.spec.js
// Окно «Как вы будете играть?» при первом запуске и режим «гость / Яндекс». Яндекс подменён заглушкой.
import { test, expect } from './fixtures.js';
import { openTab as goTab, openStatsTab } from './helpers.js';
import { stubYandex, seed, cloudFile, progress, OLD } from './yandex_stub.js';

const readJson = (page, key) => page.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}, key);

test.describe('Выбор «гость или Яндекс» при первом запуске', () => {
  test.use({ seedGuest: false });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');                                   // нужен адрес страницы, чтобы работало хранилище
  });

  test('первый запуск: окно выбора; «Играть как гость» запоминается и закрывает окно', async ({ page }) => {
    await stubYandex(page);
    await seed(page, { signedIn: false, account: null });
    const card = page.locator('#clWelcome');
    await expect(card).toBeVisible();
    await expect(card.locator('#clGuest')).toBeVisible();
    await expect(card.locator('#clWelcomeLogin')).toBeVisible();
    await card.locator('#clGuest').click();
    await expect(card).toBeHidden();
    await expect(page.locator('#clToast'), 'выбор «гость» уведомления не показывает').toBeHidden();
    expect((await readJson(page, 'perudo.device')).account).toBe('guest');
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    await expect(page.locator('#clWelcome')).toBeHidden();
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#clStatus')).toContainText('как гость');
    await expect(page.locator('#clLogin')).toBeVisible();
  });

  test('первый запуск: «Войти через Яндекс» в окне выбора ведёт к входу и запоминает Яндекс', async ({ page }) => {
    const cloud = await stubYandex(page);
    await seed(page, { games: 2, signedIn: false, account: null });
    await page.locator('#clWelcomeLogin').click();
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#clSave')).toBeVisible();
    expect(cloud.logins).toBe(1);
    expect((await readJson(page, 'perudo.device')).account).toBe('yandex');
    await expect(page.locator('#clToast')).toBeVisible();
    await expect(page.locator('#clWelcome')).toBeHidden();
  });

  test('информационное уведомление скрывается само через 7 секунд, под шапкой и со своей кнопкой «✕»', async ({ page }) => {
    await page.clock.install();
    await stubYandex(page);
    await seed(page, { games: 2, signedIn: false, account: null });
    await page.locator('#clWelcomeLogin').click();
    const toast = page.locator('#clToast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Вход выполнен');
    const head = await page.locator('.app-header').boundingBox();
    const box = await toast.boundingBox();
    expect(box.y, 'уведомление не перекрывает шапку').toBeGreaterThanOrEqual(head.y + head.height - 1);
    await page.clock.fastForward(8000);
    await expect(toast).toBeHidden();
  });

  test('вход выполнен раньше выбора (токен уже есть): окно не показываем, аккаунт — Яндекс', async ({ page }) => {
    await stubYandex(page);
    await seed(page, { games: 2, signedIn: true, synced: null, account: null });
    await expect(page.locator('#clWelcome')).toBeHidden();
    expect((await readJson(page, 'perudo.device')).account).toBe('yandex');
  });

  test('Esc откладывает выбор: окно откроется снова при следующем запуске, режим не записан', async ({ page }) => {
    await stubYandex(page);
    await seed(page, { signedIn: false, account: null });
    await expect(page.locator('#clWelcome')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#clWelcome')).toBeHidden();
    expect((await readJson(page, 'perudo.device'))?.account ?? null).toBeNull();
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    await expect(page.locator('#clWelcome')).toBeVisible();
  });

  test('«Выйти» возвращает в режим гостя, окно выбора не открывается снова', async ({ page }) => {
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
    await seed(page, { games: 3, synced: OLD });
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    page.once('dialog', (d) => d.accept());
    await page.locator('#clLogout').click();
    expect((await readJson(page, 'perudo.device')).account).toBe('guest');
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    await expect(page.locator('#clWelcome')).toBeHidden();
  });
});
