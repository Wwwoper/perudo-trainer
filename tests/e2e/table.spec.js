// tests/e2e/table.spec.js
// Запуск: npm run test:e2e  (Playwright Test, а не `node --test`).
import { test, expect } from '@playwright/test';

/** Открывает вкладку панели (на телефоне — через кнопку в HUD / шторку). */
async function openTab(page, tabId) {
  const hudBtn = page.locator(`.hud-tab-btn[data-open-tab="${tabId}"]`);
  // На узком экране панель — шторка, её открывает кнопка в HUD;
  // на широком кнопки в HUD нет, вкладки видны всегда.
  if (await hudBtn.isVisible()) await hudBtn.click();
  else await page.locator('#' + tabId).click();
}

async function openSettings(page) {
  await openTab(page, 'tabSettings');
  await expect(page.locator('#panSettings')).toBeVisible();
}

/** Выставляет количество: на телефоне поле readonly, поэтому жмём «+»/«−». */
async function setQuantity(page, n) {
  const q = page.locator('#gQ');
  for (let i = 0; i < 40; i++) {
    const cur = Number(await q.inputValue());
    if (cur === n) return;
    await page.locator(cur < n ? '#gPlus' : '#gMinus').click();
  }
  throw new Error('Не удалось выставить количество ' + n);
}

/**
 * Задаёт настройки и начинает новую партию через панель настроек.
 * Вскрытие кубиков по умолчанию выключаем: модальное окно блокирует клики
 * и ставит ботов на паузу (его проверяет отдельный тест).
 */
async function startGame(page, { bots, dice, assist, calza, reveal = false } = {}) {
  await openSettings(page);
  if (bots !== undefined) await page.locator('#gBots').fill(String(bots));
  if (dice !== undefined) await page.locator('#gDice').fill(String(dice));
  if (assist) await page.selectOption('#gAssist', assist);
  if (calza !== undefined) await page.locator('#gCalzaOpt').setChecked(calza);
  await page.locator('#gRevealOpt').setChecked(reveal);
  // Партия создана и стол отрисован — дальше тесты работают уже с готовым столом.
  // Если клик не сработал, он повторяется (настройки при этом не сбрасываются).
  await expect(async () => {
    await page.locator('#panSettings .side-start[data-action="new-game"]').click();
    await expect(page.locator('#gameTable .seat').first()).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
}

async function waitMyTurn(page) {
  await page.waitForFunction(
    () => document.querySelector('#gStatus')?.textContent?.includes('Ваш ход'),
    null, { timeout: 10_000 });
}

/** Ждём, пока ход вернулся к нам и на столе лежит чужая ставка. */
async function waitBotBid(page) {
  await page.waitForFunction(() => {
    const g = window.__perudo_v2?.game;
    const s = document.querySelector('#gStatus')?.textContent || '';
    return s.includes('Ваш ход') && g?.bid && g.bid.playerId !== 'human';
  }, null, { timeout: 10_000 });
}

/** Боты получают руки, при которых они гарантированно повышают ставку. */
async function rigBots(page, hand) {
  await page.evaluate((h) => {
    const g = window.__perudo_v2?.game;
    for (let i = 1; i < g.players.length; i++) g.players[i].hand = [...h];
  }, hand);
}

test.describe('Покерный стол в партии', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('requestfailed', (r) => console.error('[requestfailed]', r.url(), r.failure()?.errorText));
    await page.goto('/');
    // ES-модули выполняются после загрузки страницы: пока app_v2.js не отработал,
    // на вкладках нет обработчиков, и ранний клик тихо пропадает.
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    // Клик повторяется, пока вкладка не переключится: на медленной машине
    // и при параллельных воркерах первый клик иногда теряется.
    await expect(async () => {
      await page.locator('.tab-btn[data-t="game"]').click();
      await expect(page.locator('#game')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    // Поля настроек теперь лежат в скрытой вкладке — их открывает openSettings().
    await expect(page.locator('#gameTable')).toBeVisible();
  });

  test('новая партия рисует стол, места игроков и центральную ставку', async ({ page }) => {
    await startGame(page, { bots: 3, dice: 3 });

    await expect(page.locator('#gameTable .seat')).toHaveCount(4);
    // Центр стола: только ставка или «Ставок ещё нет»; раунд и число кубиков — в HUD.
    await expect(page.locator('#gameTable .table-center')).toBeVisible();
    await expect(page.locator('#gMeta')).toContainText('Раунд');
    await expect(page.locator('#gMeta')).toContainText('12'); // 4 × 3
    await expect(page.locator('#gameTable .seat.active')).toHaveCount(1);
  });

  test('игрок может поставить, стол обновляет ставку', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 2 });
    await waitMyTurn(page);
    await rigBots(page, [2, 2]);

    await expect(page.locator('#gRaise')).toBeEnabled();
    await expect(page.locator('#gPick button')).toHaveCount(6);

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(2).click(); // грань 3
    await page.locator('#gRaise').click();

    await expect(page.locator('#gameTable .table-bid')).toBeVisible();
    await expect(page.locator('#gameTable .table-bid')).toContainText('1');
    await expect(page.locator('#gHistory')).not.toBeEmpty();
  });

  test('кнопка «Не верю» завершает раунд и обновляет стол', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 2 });
    await waitMyTurn(page);
    await rigBots(page, [2, 2]);

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(1).click(); // грань 2
    await page.locator('#gRaise').click();

    await waitBotBid(page);
    await page.locator('#gDudo').click();

    // Журнал находится во вкладке «Журнал» — открываем её.
    await openTab(page, 'tabLog');
    await expect(page.locator('#gHistory')).toContainText(/НЕ ВЕРЮ/i);
    await expect(page.locator('#gHistory')).toContainText(/Проверка/i);
  });

  test('вскрытие кубиков: окно показывается после «Не верю» и закрывается', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 2, reveal: true });
    await waitMyTurn(page);
    await rigBots(page, [2, 2]);

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(1).click();
    await page.locator('#gRaise').click();
    await waitBotBid(page);
    await page.locator('#gDudo').click();

    const dlg = page.locator('#gReveal');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('режим «Игра» не показывает проценты на столе', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 2, assist: 'game' });
    await waitMyTurn(page);

    expect((await page.locator('#gPrev').textContent()) || '').not.toMatch(/%/);
    expect((await page.locator('#gameTable').textContent()) || '').not.toMatch(/%|шанс/i);
  });

  test('режим «Новичок» показывает прямую рекомендацию', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 3, assist: 'novice' });
    await waitMyTurn(page);
    await rigBots(page, [2, 3, 4]);

    // Подсказка «Расчёт» видна на вкладке «Расчёт».
    await openTab(page, 'tabCalc');
    await expect(page.locator('#gPractical')).toBeVisible();
    await expect(page.locator('#gPractical')).toContainText(/Быстрый расчёт|Безопасная ставка/);
    await page.keyboard.press('Escape'); // на телефоне закрывает шторку

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(1).click();
    await page.locator('#gRaise').click();
    await waitBotBid(page);

    const advice = page.locator('#gAdvice');
    await expect(advice).toBeVisible();
    await expect(advice).toContainText(/Лучше сказать «Не верю»|Ставка вероятна/);
  });

  test('режим «Игра» не показывает прямые советы', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 2, assist: 'game' });
    await waitMyTurn(page);
    await expect(page.locator('#gAdvice')).toBeEmpty();
  });

  test('Calza: доступна при включённой опции, скрыта при выключенной', async ({ page }) => {
    await startGame(page, { calza: false });
    await expect(page.locator('#gCalza')).toHaveClass(/hide/);

    await startGame(page, { bots: 2, dice: 3, calza: true });
    await waitMyTurn(page);
    await expect(page.locator('#gCalza')).not.toHaveClass(/hide/);
    await expect(page.locator('#gCalza')).toBeDisabled();

    await rigBots(page, [2, 3, 4]);
    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(1).click();
    await page.locator('#gRaise').click();
    await expect(page.locator('#gPrev')).not.toContainText(/недопустима/i);

    await waitBotBid(page);
    await expect(page.locator('#gCalza')).toBeEnabled();
  });
});
