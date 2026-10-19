// tests/e2e/stats.spec.js
// Статистика тренажёра и упражнений хранится в одном объекте (perudo.userProfile).
// Ответ в одном разделе не должен стирать счётчики другого.
import { test, expect } from './fixtures.js';
import { openTab as goTab, openStatsTab } from './helpers.js';

const profile = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('perudo.userProfile') || 'null'));

async function openTab(page, name) {
  await goTab(page, name);
}

async function answerTrainer(page) {
  await openTab(page, 'train');
  await page.click('#tDudo');
}

async function answerDrill(page) {
  await openTab(page, 'drill');
  await page.fill('#dA1', '5');
  await page.fill('#dA2', '5');
  await page.click('#dACheck');
}

test.describe('Статистика: разделы не затирают друг друга', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('ответ в упражнениях не стирает счётчики тренажёра', async ({ page }) => {
    await answerTrainer(page);
    expect((await profile(page)).n).toBe(1);

    await answerDrill(page);
    const p = await profile(page);
    expect(p.n, 'решения тренажёра сохранились').toBe(1);
    expect(p.drill.A.n, 'ответ упражнения записан').toBe(1);
  });

  test('ответ в тренажёре не стирает счётчики упражнений', async ({ page }) => {
    await answerDrill(page);
    expect((await profile(page)).drill.A.n).toBe(1);

    await answerTrainer(page);
    const p = await profile(page);
    expect(p.drill.A.n, 'ответы упражнений сохранились').toBe(1);
    expect(p.n, 'решение тренажёра записано').toBe(1);
  });

  test('счётчики копятся при чередовании разделов', async ({ page }) => {
    await answerTrainer(page);
    await answerDrill(page);
    await openTab(page, 'train');
    await page.click('#tNext');
    await page.click('#tDudo');
    await answerDrill(page);   // «Проверить» повторно: новый вопрос не нужен, ответ считается

    const p = await profile(page);
    expect(p.n).toBe(2);
    expect(p.drill.A.n).toBe(2);
  });
});

test('«Статистика» показывает названия режимов, а не идентификаторы', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await goTab(page, 'train');
  await page.click('#tDudo');                  // один ответ в режиме по умолчанию («Классика»)
  await goTab(page, 'stats');
  const cell = page.locator('#stByMode tr').nth(1).locator('td').first();
  await expect(cell).toHaveText('Классика');
});

test.describe('«Статистика»: подвкладки', () => {
  const visible = (page, id) => page.locator(`#stPanel${id}`).isVisible();

  test('сначала «Результаты»: настройки и опасные кнопки не на виду', async ({ page }) => {
    await page.goto('/');
    await goTab(page, 'stats');
    await expect(page.locator('#stTabResults')).toHaveAttribute('aria-selected', 'true');
    expect(await visible(page, 'Results')).toBe(true);
    expect(await visible(page, 'Player')).toBe(false);
    expect(await visible(page, 'Data')).toBe(false);
    await expect(page.locator('#stClear')).toBeHidden();
    await expect(page.locator('#stWeak')).toBeVisible();
  });

  test('переключение мышью показывает только свою панель; профиль и данные на месте', async ({ page }) => {
    await page.goto('/');
    await goTab(page, 'stats');
    await openStatsTab(page, 'player');
    expect(await visible(page, 'Player')).toBe(true);
    expect(await visible(page, 'Results')).toBe(false);
    await expect(page.locator('#plName')).toBeVisible();
    await openStatsTab(page, 'data');
    expect(await visible(page, 'Data')).toBe(true);
    for (const sel of ['#stExport', '#stImport', '#stClear', '#plCloud']) await expect(page.locator(sel)).toBeVisible();
    await expect(page.locator('#stTabData')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#stTabResults')).toHaveAttribute('aria-selected', 'false');
  });

  test('клавиатура: стрелки по кругу, Home/End; фокус идёт за вкладкой', async ({ page }) => {
    await page.goto('/');
    await goTab(page, 'stats');
    await page.locator('#stTabResults').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#stTabPlayer')).toBeFocused();
    expect(await visible(page, 'Player')).toBe(true);
    await page.keyboard.press('End');
    await expect(page.locator('#stTabData')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#stTabResults')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#stTabData')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#stTabResults')).toBeFocused();
    // в порядке обхода Tab активна только выбранная вкладка
    await expect(page.locator('#stTabs [tabindex="-1"]')).toHaveCount(2);
  });

  test('выбранная вкладка помнится после перезагрузки; сброс хранилища возвращает «Результаты»', async ({ page }) => {
    await page.goto('/');
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await page.reload();
    await goTab(page, 'stats');
    expect(await visible(page, 'Data')).toBe(true);
    await page.evaluate(() => sessionStorage.setItem('perudo.statsTab', 'мусор'));
    await page.reload();
    await goTab(page, 'stats');
    expect(await visible(page, 'Results')).toBe(true);
  });

  test('одна вкладка выбрана, остальные скрыты от экранного чтения (hidden), у вкладок есть роли', async ({ page }) => {
    await page.goto('/');
    await goTab(page, 'stats');
    await expect(page.locator('#stTabs')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#stTabs [role="tab"]')).toHaveCount(3);
    await expect(page.locator('#stats [role="tabpanel"]:not([hidden])')).toHaveCount(1);
  });
});
