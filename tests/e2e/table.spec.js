// tests/e2e/table.spec.js
// Запуск: npm run test:e2e  (Playwright Test, а не `node --test`).
import { test, expect } from '@playwright/test';
import { openTab as goTab } from './helpers.js';

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
async function startGame(page, { bots, dice, assist, calza, reveal = false, styles, level, memory } = {}) {
  await openSettings(page);
  if (bots !== undefined) await page.locator('#gBots').fill(String(bots));
  // Стили ботов: массив id по порядку ботов ('skeptic', 'random', 'auto' …).
  if (styles) {
    for (let i = 0; i < styles.length; i++) await page.selectOption(`#gBotStyle${i}`, styles[i]);
  }
  if (dice !== undefined) await page.locator('#gDice').fill(String(dice));
  if (assist) await page.selectOption('#gAssist', assist);
  if (level) await page.selectOption('#gBotLevel', level);
  if (memory !== undefined) await page.locator('#gMemoryOpt').setChecked(memory);
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
      await goTab(page, 'game');
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

  test('стиль каждого бота выбирается в настройках и виден за столом', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 3, styles: ['skeptic', 'aggressor'] });
    const styles = await page.evaluate(() => window.__perudo_v2.game.players.slice(1).map((p) => p.style));
    expect(styles).toEqual(['skeptic', 'aggressor']);
    await expect(page.locator('#gameTable .seat-style')).toHaveText(['🧐', '🔥']);
  });

  test('по умолчанию стили раздаются по кругу: осторожный, блефующий, умный', async ({ page }) => {
    await startGame(page, { bots: 3, dice: 3 });
    const styles = await page.evaluate(() => window.__perudo_v2.game.players.slice(1).map((p) => p.style));
    expect(styles).toEqual(['careful', 'bluffer', 'smart']);
  });

  test('полей выбора стиля столько же, сколько ботов, выбор сохраняется при смене числа', async ({ page }) => {
    await openSettings(page);
    await page.locator('#gBots').fill('4');
    await expect(page.locator('#gBotStyles select')).toHaveCount(4);
    await page.selectOption('#gBotStyle0', 'skeptic');
    await page.locator('#gBots').fill('2');
    await expect(page.locator('#gBotStyles select')).toHaveCount(2);
    await expect(page.locator('#gBotStyle0')).toHaveValue('skeptic');
    await page.locator('#gBots').fill('5');
    await expect(page.locator('#gBotStyles select')).toHaveCount(5);
    await expect(page.locator('#gBotStyle0')).toHaveValue('skeptic');
    await expect(page.locator('#gBotStyle4')).toHaveValue('auto');
  });

  test('«Случайный» стиль даёт одного из известных стилей', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 3, styles: ['random', 'random'] });
    const styles = await page.evaluate(() => window.__perudo_v2.game.players.slice(1).map((p) => p.style));
    for (const s of styles) expect(['careful', 'bluffer', 'smart', 'aggressor', 'skeptic']).toContain(s);
  });

  // Заведомо ложная ставка человека: на столе всего 4 кубика, из них шестёрок нет.
  async function bluffAndGetChecked(page) {
    await waitMyTurn(page);
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [2, 3];
      g.players[1].hand = [2, 2];
    });
    await setQuantity(page, 4);
    await page.locator('#gPick button').nth(5).click();        // грань 6
    await page.locator('#gRaise').click();
    await expect(page.locator('#gHistory')).toContainText(/НЕ ВЕРЮ/i, { timeout: 10_000 });
  }

  const readMemory = (page) => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('perudo.botMemory')); } catch { return null; }
  });

  test('настройки уровня и памяти ботов: значения по умолчанию', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#gBotLevel')).toHaveValue('normal');
    await expect(page.locator('#gBotLevel option')).toHaveCount(3);
    await expect(page.locator('#gMemoryOpt')).toBeChecked();
    await expect(page.locator('#gMemoryInfo')).toContainText('присматриваются');
  });

  test('бот запоминает, что проверил ложную ставку человека, и помнит это после перезагрузки', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 2 });
    await bluffAndGetChecked(page);
    expect(await readMemory(page)).toMatchObject({ challenged: 1, bluffs: 1 });

    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    await goTab(page, 'game');
    await openSettings(page);
    await expect(page.locator('#gMemoryInfo')).toContainText('проверено ставок — 1');
  });

  test('«Забыть мою игру» очищает память', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 2 });
    await bluffAndGetChecked(page);
    expect(await readMemory(page)).toMatchObject({ challenged: 1 });

    await openSettings(page);
    await page.locator('#gMemoryReset').click();
    expect(await readMemory(page)).toMatchObject({ challenged: 0, bluffs: 0 });
    await expect(page.locator('#gMemoryInfo')).toContainText('проверено ставок — 0');
  });

  test('при выключенной памяти боты ничего не запоминают', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 2, memory: false });
    await bluffAndGetChecked(page);
    expect(await readMemory(page)).toBeNull();
  });

  test('уровень ботов «Сильный» и «Лёгкий» принимаются, партия идёт', async ({ page }) => {
    for (const level of ['hard', 'easy']) {
      await startGame(page, { bots: 2, dice: 3, level });
      await waitMyTurn(page);
      await expect(page.locator('#gRaise')).toBeEnabled();
    }
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
  const readJson = (page, key) => page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  }, key);

  /** Ваш ход в начале партии, у обоих по одному кубику: ложная ставка 2×6 заведомо проигрывает. */
  async function loseWithBluff(page) {
    await startGame(page, { bots: 1, dice: 1 });
    await waitMyTurn(page);
    expect(await page.evaluate(() => window.__perudo_v2.game.bid), 'человек ходит первым, ставки нет').toBeNull();
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [2];
      g.players[1].hand = [2];
    });
    await setQuantity(page, 2);
    await page.locator('#gPick button').nth(5).click();        // грань 6
    await page.locator('#gRaise').click();
    await expect(page.locator('#gHistory')).toContainText(/НЕ ВЕРЮ/i, { timeout: 10_000 });
  }

  test('решения записываются: счётчики по меткам и ключевой момент после проигрыша', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect.poll(async () => (await readJson(page, 'perudo.reviews'))?.length ?? 0, { timeout: 10_000 }).toBe(1);

    const [m] = await readJson(page, 'perudo.reviews');
    expect(m).toMatchObject({ kind: 'raise', code: 'bad', lostDie: true, n: 2, myDice: 1, bid: null, played: { q: 2, f: 6 }, wild: true });
    expect(m.tags).toEqual(expect.arrayContaining(['raise', 'endgame', 'lastDie']));

    const profile = await readJson(page, 'perudo.userProfile');
    expect(profile.byTag.raise).toEqual({ n: 1, good: 0 });
    expect(profile.byTag.endgame).toEqual({ n: 1, good: 0 });
  });

  test('«Сбросить всё» стирает записанные решения и счётчики по меткам', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect.poll(async () => (await readJson(page, 'perudo.reviews'))?.length ?? 0, { timeout: 10_000 }).toBe(1);

    await page.evaluate(() => { document.querySelector('#gResultDialog')?.close?.(); });
    page.once('dialog', (d) => d.accept());
    await goTab(page, 'stats');
    await page.locator('#stClear').click();
    await expect.poll(async () => (await readJson(page, 'perudo.reviews'))?.length ?? 0).toBe(0);
    expect((await readJson(page, 'perudo.userProfile')).byTag).toEqual({});
  });

  test('верные решения не попадают в ключевые моменты, но считаются в счётчиках', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await startGame(page, { bots: 1, dice: 1 });
    await waitMyTurn(page);
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [6];
      g.players[1].hand = [6];
    });
    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(5).click();        // 1×6 при двух шестёрках на столе — надёжно
    await page.locator('#gRaise').click();
    await expect.poll(async () => (await readJson(page, 'perudo.userProfile'))?.byTag?.raise?.n ?? 0).toBe(1);
    const profile = await readJson(page, 'perudo.userProfile');
    expect(profile.byTag.raise.good).toBe(1);
    expect(await readJson(page, 'perudo.reviews')).toBeNull();    // партия ещё идёт, ключевых моментов нет
  });
  test('«Не верю» записывается как проверка с меткой «единицы» и считается верным решением', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await startGame(page, { bots: 1, dice: 1 });
    await waitMyTurn(page);
    // Чужая ставка 2×1 при руках без единиц: проверка заведомо верна.
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [2];
      g.players[1].hand = [3];
      g.bid = { playerId: g.players[1].id, q: 2, f: 1 };
      window.__perudo_v2.renderGame();
    });
    await page.locator('#gDudo').click();
    await expect.poll(async () => (await readJson(page, 'perudo.userProfile'))?.byTag?.dudo?.n ?? 0).toBe(1);
    const tags = (await readJson(page, 'perudo.userProfile')).byTag;
    expect(tags.dudo).toEqual({ n: 1, good: 1 });
    expect(tags.ones).toEqual({ n: 1, good: 1 });
    expect(tags.endgame).toEqual({ n: 1, good: 1 });
  });

  /** Ставка бота 1×6 при вашей шестёрке: «Не верю» — ошибка, ситуацию можно разобрать. */
  async function loseByWrongDudo(page) {
    await startGame(page, { bots: 1, dice: 1 });
    await waitMyTurn(page);
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [6];
      g.players[1].hand = [2];
      g.bid = { playerId: g.players[1].id, q: 1, f: 6 };
      window.__perudo_v2.renderGame();
    });
    await page.locator('#gDudo').click();
    await expect(page.locator('#gResultCard .key-moment')).toHaveCount(1, { timeout: 10_000 });
  }

  test('итог партии: ключевой момент и «Разобрать в тренажёре» открывает ситуацию без дублей', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseByWrongDudo(page);
    await page.evaluate(() => { document.querySelector('#gResultDialog')?.close?.(); });
    await openTab(page, 'tabLog');                       // на телефоне открывает шторку с итогом
    const card = page.locator('#gResultCard');
    await expect(card).toContainText('Ключевые моменты');
    await expect(card.locator('.key-moment').first()).toBeHidden();       // свёрнуто, карточка компактна
    await card.locator('.key-moments > summary').click();
    await expect(card).toContainText(/Чаще всего ошибки в теме/);
    await expect(card.locator('.key-moment .trainer-option').first()).toBeVisible();

    const replay = card.locator('.key-moment-replay');
    await expect(replay).toHaveCount(1);
    await replay.scrollIntoViewIfNeeded();
    await replay.click();
    await expect(page.locator('#tMode')).toHaveValue('endgame');
    await expect(page.locator('.trainer-repeat')).toBeVisible();
    const queue = () => readJson(page, 'perudo.trainingQueue');
    const first = await queue();
    expect(first).toHaveLength(1);

    // Повторное нажатие не создаёт дубль.
    await page.evaluate(() => document.querySelector('.key-moment-replay')?.click());
    const second = await queue();
    expect(second).toHaveLength(1);
  });

  test('первый ход в раунде (без чужой ставки) в тренажёр не переносится', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect(page.locator('#gResultCard .key-moment')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('#gResultCard .key-moment-replay')).toHaveCount(0);
  });
});
