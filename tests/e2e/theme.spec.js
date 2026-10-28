// tests/e2e/theme.spec.js — тема оформления: ранняя установка, сохранение, «Системная».
import { test, expect } from './fixtures.js';
import { openTab } from './helpers.js';

const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const ready = (page) => page.waitForFunction(() => Boolean(window.__perudo_v2));

test.describe('Тема оформления', () => {
  test('по умолчанию — светлая, data-theme стоит на <html>', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe('light');
  });

  test('тема ставится до загрузки приложения: без модулей страница уже с нужной темой', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('perudo.settings', JSON.stringify({ theme: 'dark' })));
    await page.route('**/src/app_v2.js', (route) => route.abort());
    await page.goto('/');
    expect(await theme(page)).toBe('dark');
  });

  test('выбор сохраняется между перезагрузками', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.__perudo_v2.setThemeMode('dark'));
    expect(await theme(page)).toBe('dark');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.settings')).theme)).toBe('dark');
    await page.reload();
    await ready(page);
    expect(await theme(page)).toBe('dark');
    await page.evaluate(() => window.__perudo_v2.setThemeMode('мусор'));
    expect(await theme(page)).toBe('light');
  });

  test('«Системная» следует системной теме и реагирует на её смену без перезагрузки', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => { if (!localStorage.getItem('perudo.settings')) localStorage.setItem('perudo.settings', JSON.stringify({ theme: 'system' })); });
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('явный выбор не зависит от системной темы', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('perudo.settings', JSON.stringify({ theme: 'dark' })));
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await theme(page)).toBe('dark');
    await page.evaluate(() => window.__perudo_v2.setThemeMode('light'));
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await theme(page)).toBe('light');
  });

  test('цвет адресной строки (theme-color) совпадает с фоном темы', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const same = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      return document.querySelector('meta[name="theme-color"]').getAttribute('content') === bg;
    });
    expect(same).toBe(true);
  });

  test('мусор в сохранённых настройках не ломает загрузку', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => localStorage.setItem('perudo.settings', '{oops'));
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe('light');
    expect(errors).toEqual([]);
  });

  test('выбор на вкладке «Статистика» → «Игрок»: применяется сразу, запоминается, пояснение меняется', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await ready(page);
    await openTab(page, 'stats');
    await page.locator('#stTabPlayer').click();
    const radios = page.locator('input[name="stTheme"]');
    await expect(radios).toHaveCount(3);
    await expect(page.locator('input[name="stTheme"][value="light"]')).toBeChecked();   // по умолчанию
    await expect(page.locator('#stThemeHelp')).toContainText('Светлая');
    await page.locator('label:has(input[name="stTheme"][value="dark"])').click();
    expect(await theme(page)).toBe('dark');
    await expect(page.locator('#stThemeHelp')).toContainText('Тёмная');
    await page.locator('label:has(input[name="stTheme"][value="system"])').click();
    await expect(page.locator('#stThemeHelp')).toContainText('светлая');                 // система светлая
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('#stThemeHelp')).toContainText('тёмная');                  // пояснение следует за системой
    expect(await theme(page)).toBe('dark');
    await page.reload();
    await ready(page);
    await openTab(page, 'stats');
    await page.locator('#stTabPlayer').click();
    await expect(page.locator('input[name="stTheme"][value="system"]')).toBeChecked();
  });

  test('режим сохраняется в настройках, которые входят в копию', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.__perudo_v2.setThemeMode('system'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.settings')));
    expect(saved.theme).toBe('system');
  });

  test('в тёмной теме партия идёт без ошибок: стол, ставка, ход ботов', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => localStorage.setItem('perudo.settings', JSON.stringify({ theme: 'dark', botSpeed: 'fast' })));
    await page.goto('/');
    await ready(page);
    await openTab(page, 'game');
    await page.locator('#gBots').fill('2');
    await page.locator('#gRevealOpt').setChecked(false);
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat').first()).toBeVisible();
    await page.waitForFunction(() => {
      const g = window.__perudo_v2.game;
      return g && g.state === 'active' && g.currentPlayer === 0;
    }, null, { timeout: 15_000 });
    await page.locator('#gRaise').click();
    await page.waitForFunction(() => window.__perudo_v2.game.currentPlayer === 0, null, { timeout: 15_000 });
    expect(await theme(page)).toBe('dark');
    expect(errors).toEqual([]);
  });

  test('цвет текста и фон меняются вместе с темой', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const colors = () => page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    await page.evaluate(() => window.__perudo_v2.setThemeMode('light'));
    const light = await colors();
    await page.evaluate(() => window.__perudo_v2.setThemeMode('dark'));
    const dark = await colors();
    expect(light.bg).not.toBe(dark.bg);
    expect(light.fg).not.toBe(dark.fg);
  });
});
