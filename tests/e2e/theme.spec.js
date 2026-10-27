// tests/e2e/theme.spec.js — тема оформления: ранняя установка, сохранение, «Системная».
import { test, expect } from './fixtures.js';

const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const ready = (page) => page.waitForFunction(() => Boolean(window.__perudo_v2));

test.describe('Тема оформления', () => {
  test('по умолчанию — тёмная, data-theme стоит на <html>', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe('dark');
  });

  test('тема ставится до загрузки приложения: без модулей страница уже с нужной темой', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('perudo.settings', JSON.stringify({ theme: 'light' })));
    await page.route('**/src/app_v2.js', (route) => route.abort());
    await page.goto('/');
    expect(await theme(page)).toBe('light');
  });

  test('выбор сохраняется между перезагрузками', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.__perudo_v2.setThemeMode('light'));
    expect(await theme(page)).toBe('light');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.settings')).theme)).toBe('light');
    await page.reload();
    await ready(page);
    expect(await theme(page)).toBe('light');
    await page.evaluate(() => window.__perudo_v2.setThemeMode('мусор'));
    expect(await theme(page)).toBe('dark');
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
    expect(await theme(page)).toBe('dark');
    expect(errors).toEqual([]);
  });
});
