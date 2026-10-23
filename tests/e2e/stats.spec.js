// tests/e2e/stats.spec.js
// Статистика тренажёра и упражнений хранится в одном объекте (perudo.userProfile).
// Ответ в одном разделе не должен стирать счётчики другого.
import { test, expect } from './fixtures.js';
import { openTab as goTab, openStatsTab } from './helpers.js';
import { stubYandex, seed, cloudFile, progress, OLD } from './yandex_stub.js';

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
  // после проверки кнопка недоступна до «Новое»: одна задача — одна запись
  if (await page.locator('#dACheck').isDisabled()) await page.click('#dNew');
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
    await answerDrill(page);   // новая задача («Новое» нажимается внутри) — снова одна запись

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
    await expect(page.locator('#stEmpty')).toBeVisible();           // у новичка — приглашение, а не таблицы с нулями
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

test.describe('«Данные»: единый блок «Сохранность данных»', () => {
  // Браузер сообщает, что хранилище не защищено: совет про сохранность должен быть показан
  const unprotected = (page) => page.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persisted = async () => false;
      navigator.storage.persist = async () => false;
    }
  });

  test('облако, файл и совет про браузер — в одной карточке, «Сбросить всё» отдельно и ниже', async ({ page }) => {
    await unprotected(page);
    await page.goto('/');
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    const card = page.locator('.data-card');
    await expect(card.locator('.data-title')).toHaveText('Сохранность данных');
    for (const sel of ['#plCloud', '#stExport', '#stImport', '#stBackupMsg', '#stPersist']) {
      await expect(card.locator(sel)).toHaveCount(1);
    }
    await expect(card.locator('#stClear')).toHaveCount(0);
    const [c, r] = await Promise.all([card.boundingBox(), page.locator('#stClear').boundingBox()]);
    expect(r.y).toBeGreaterThanOrEqual(c.y + c.height);
  });

  test('гость: совет — сохранить файл или войти через Яндекс', async ({ page }) => {
    await unprotected(page);
    await page.goto('/');
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#stPersist')).toContainText('Экспорт JSON');
    await expect(page.locator('#stPersist')).toContainText('войдите через Яндекс');
  });

  test('после входа в Яндекс совет про файл заменяется советом про облако — сразу, без перезагрузки', async ({ page }) => {
    await unprotected(page);
    await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
    await page.goto('/');
    await seed(page, { games: 3, synced: OLD });
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
    await expect(page.locator('#stPersist')).toContainText('Яндекс Диске');
    await expect(page.locator('#stPersist')).not.toContainText('Экспорт JSON');
    page.once('dialog', (d) => d.accept());
    await page.locator('#clLogout').click();
    await expect(page.locator('#stPersist')).toContainText('войдите через Яндекс');
  });
});

test.describe('«Результаты»: итоги и малая выборка', () => {
  const seedProfile = async (page, over) => {
    await page.goto('/');
    await page.evaluate((o) => {
      localStorage.setItem('perudo.userProfile', JSON.stringify({
        n: 0, good: 0, totalGames: 0, totalWins: 0, byMode: {}, byTag: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } }, ...o,
      }));
    }, over);
    await page.reload();
    await goTab(page, 'stats');
  };
  const tile = (page, i) => page.locator('#stTiles .stat-tile').nth(i);

  test('новичок: вместо таблиц с нулями — приглашение, итоги и сводка скрыты', async ({ page }) => {
    await seedProfile(page, {});
    await expect(page.locator('#stEmpty')).toBeVisible();
    await expect(page.locator('#stEmpty')).toContainText('Пока здесь пусто');
    await expect(page.locator('#stFilled')).toBeHidden();
    await expect(page.locator('#stTiles')).toBeHidden();
  });

  test('приглашение ведёт в партию и в тренажёр', async ({ page }) => {
    await seedProfile(page, {});
    await page.locator('#stEmpty [data-go="train"]').click();
    await expect(page.locator('#train')).toBeVisible();
    await goTab(page, 'stats');
    await page.locator('#stEmpty [data-go="game"]').click();
    await expect(page.locator('#game')).toBeVisible();
  });

  test('первый же ответ в тренажёре убирает приглашение, итоги с нулями появляются', async ({ page }) => {
    await seedProfile(page, {});
    await goTab(page, 'train');
    await page.click('#tDudo');
    await goTab(page, 'stats');
    await expect(page.locator('#stEmpty')).toBeHidden();
    await expect(page.locator('#stFilled')).toBeVisible();
    await expect(tile(page, 0).locator('.stat-value')).toHaveText('0');
    await expect(tile(page, 0).locator('.stat-note')).toHaveText('пока нет');
    await expect(tile(page, 1).locator('.stat-value')).toHaveText('—');
    await expect(tile(page, 1).locator('.stat-note')).toHaveText('мало: 1 из 8');   // очередь повторов зависит от случайной ситуации — не проверяем
  });

  test('малая выборка: вместо «0.0%» и «50.0%» написано, что данных мало', async ({ page }) => {
    await seedProfile(page, { n: 4, good: 2, totalGames: 1, totalWins: 0, byMode: { classic: { n: 4, good: 2 } } });
    await expect(tile(page, 0).locator('.stat-value')).toHaveText('1');
    await expect(tile(page, 0).locator('.stat-note')).toContainText('побед: 0');
    await expect(tile(page, 0).locator('.stat-note')).toContainText('мало');
    await expect(tile(page, 1).locator('.stat-value')).toHaveText('—');
    await expect(tile(page, 1).locator('.stat-note')).toHaveText('мало: 4 из 8');
    await expect(page.locator('#stTiles')).not.toContainText('%');
    await expect(page.locator('#stByMode tr').nth(1).locator('td').nth(3)).toHaveText('—');
    await expect(page.locator('#stByMode .stat-foot')).toContainText('от 8 решений');
  });

  test('данных достаточно: проценты показаны, сноски про малую выборку нет', async ({ page }) => {
    await seedProfile(page, { n: 20, good: 15, totalGames: 10, totalWins: 4, byMode: { classic: { n: 20, good: 15 } } });
    await expect(tile(page, 0).locator('.stat-value')).toHaveText('10');
    await expect(tile(page, 0).locator('.stat-note')).toContainText('40.0%');
    await expect(tile(page, 1).locator('.stat-value')).toHaveText('75.0%');
    await expect(tile(page, 1).locator('.stat-note')).toHaveText('15 из 20');
    await expect(page.locator('#stByMode tr').nth(1).locator('td').nth(3)).toHaveText('75.0%');
    await expect(page.locator('#stByMode .stat-foot')).toHaveCount(0);
  });

  test('итоги помещаются в экран и обновляются после сброса', async ({ page }) => {
    await seedProfile(page, { n: 20, good: 15, totalGames: 10, totalWins: 4 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(await tile(page, i).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await openStatsTab(page, 'data');
    page.once('dialog', (d) => d.accept());
    await page.locator('#stClear').click();
    await openStatsTab(page, 'results');
    await expect(page.locator('#stEmpty')).toBeVisible();      // после сброса снова «пусто»
  });
});

test.describe('«Результаты»: список партий', () => {
  const seedGames = async (page, n) => {
    await page.goto('/');
    await page.evaluate((count) => {
      const now = Date.now();
      localStorage.setItem('perudo.games', JSON.stringify(Array.from({ length: count }, (_, i) =>
        ({ ts: now - (count - i) * 3600000, players: 4, rounds: 12 + i, won: i % 2 === 0, decisions: 30 + i }))));
      localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 0, good: 0, totalGames: count, totalWins: 0, byMode: {}, byTag: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
    }, n);
    await page.reload();
    await goTab(page, 'stats');
  };
  const rows = (page) => page.locator('#stGames .game-row');

  test('по умолчанию 10 свежих партий, у каждой дата, итог и краткие числа; свежая сверху', async ({ page }) => {
    await seedGames(page, 25);
    await expect(rows(page)).toHaveCount(10);
    const first = rows(page).first();
    await expect(first.locator('.game-when')).toHaveText(/^\d{2}\.\d{2}, \d{2}:\d{2}$/);
    await expect(first.locator('.game-result')).toHaveText(/победа|поражение/);
    await expect(first.locator('.game-meta')).toContainText('4 игрока · 36 раундов');      // последняя партия: раундов 12 + 24
    await expect(page.locator('#stGamesMore')).toHaveText('Показать все (25)');
  });

  test('«Показать все» раскрывает список, «Показать меньше» сворачивает', async ({ page }) => {
    await seedGames(page, 25);
    await page.locator('#stGamesMore').click();
    await expect(rows(page)).toHaveCount(25);
    await expect(page.locator('#stGamesMore')).toHaveText('Показать меньше');
    await page.locator('#stGamesMore').click();
    await expect(rows(page)).toHaveCount(10);
  });

  test('партий не больше десяти: кнопки нет; победа и поражение окрашены по-разному', async ({ page }) => {
    await seedGames(page, 4);
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('#stGamesMore')).toHaveCount(0);
    await expect(page.locator('#stGames .game-result.text-ok')).toHaveCount(2);
    await expect(page.locator('#stGames .game-result.text-bad')).toHaveCount(2);
  });

  test('список помещается в экран без горизонтальной прокрутки', async ({ page }) => {
    await seedGames(page, 25);
    await page.locator('#stGamesMore').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('#stGames').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    const b = await page.locator('#stGamesMore').boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
  });
});
