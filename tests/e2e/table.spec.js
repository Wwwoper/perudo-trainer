// tests/e2e/table.spec.js
// Запуск: npm run test:e2e  (Playwright Test, а не `node --test`).
import { test, expect } from './fixtures.js';
import { openTab as goTab, openStatsTab, openAvatarPicker } from './helpers.js';
import * as yandex from './yandex_stub.js';

/** Открывает вкладку панели (на телефоне — через кнопку в HUD / шторку). */
async function openTab(page, tabId) {
  const hudBtn = page.locator(`.hud-tab-btn[data-open-tab="${tabId}"]`);
  // На узком экране панель — шторка, её открывает кнопка в HUD;
  // на широком кнопки в HUD нет, вкладки видны всегда.
  if (await hudBtn.isVisible()) await hudBtn.click();
  else await page.locator('#' + tabId).click();
}

async function openSettings(page) {
  // До старта партии настройки уже открыты сами (на телефоне — шторкой, которая закрывает кнопки HUD).
  if (!(await page.locator('#panSettings').isVisible())) await openTab(page, 'tabSettings');
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
async function startGame(page, { bots, dice, assist, calza, reveal = false, styles, level, memory, showStyles } = {}) {
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
  if (showStyles !== undefined) await page.locator('#gShowStylesOpt').setChecked(showStyles);
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
    // До старта на странице экран подготовки с настройками.
    await expect(page.locator('#gSetup')).toBeVisible();
  });

  const isNarrow = (page) => page.viewportSize().width < 1101;
  const closeSheet = async (page) => { if (isNarrow(page)) await page.keyboard.press('Escape'); };

  test('до старта: экран подготовки вместо стола и панели, настройки на нём; кнопка запускает партию', async ({ page }) => {
    await expect(page.locator('#gSetup')).toBeVisible();
    await expect(page.locator('#gSetup #panSettings')).toBeVisible();
    await expect(page.locator('#gSide')).toBeHidden();
    await expect(page.locator('#gameTable .seat')).toHaveCount(0);
    await expect(page.locator('#gDock')).toBeHidden();
    expect(await page.evaluate(() => window.__perudo_v2.game)).toBeNull();
    const start = page.locator('#panSettings .side-start');
    await expect(start).toHaveText('Начать партию');

    await start.click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(4);            // настройки по умолчанию: 3 бота
    await expect(page.locator('#gSetup')).toBeHidden();
    await expect(page.locator('#gSide #panSettings')).toHaveCount(1);         // настройки вернулись во вкладку панели
    await expect(page.locator('#gDock')).toBeVisible();
    await expect(start).toHaveText('Начать новую партию');
    expect(await page.evaluate(() => window.__perudo_v2.game !== null)).toBe(true);
    await expect(page.locator('#tabCalc, #tabLog')).not.toHaveCount(0);
  });

  test('«Начать партию» берёт настройки с экрана подготовки', async ({ page }) => {
    await page.locator('#gBots').fill('2');
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(3);            // 2 бота и вы
  });

  // ----- Настройки последней партии запоминаются -----
  const reloadToSetup = async (page) => {
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    await expect(async () => {
      await goTab(page, 'game');
      await expect(page.locator('#gSetup')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  };
  const lastGame = (page) => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('perudo.settings'))?.lastGame ?? null; } catch { return null; }
  });

  test('настройки сыгранной партии возвращаются после перезагрузки страницы', async ({ page }) => {
    await page.locator('#gDice').fill('4');
    await page.locator('#gBots').fill('2');
    await page.locator('#gBotStyle0').selectOption('smart');
    await page.locator('#gBotStyle1').selectOption('random');
    await page.locator('#gBotLevel').selectOption('hard');
    await page.locator('#gMemoryOpt').uncheck();
    await page.locator('#gAssist').selectOption('game');
    await page.locator('#gSpeed').selectOption('fast');
    await page.locator('#gCalzaOpt').check();
    await page.locator('#gPalificoOpt').check();
    await page.locator('#gRevealOpt').uncheck();
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(3);

    await reloadToSetup(page);
    await expect(page.locator('#gDice')).toHaveValue('4');
    await expect(page.locator('#gBots')).toHaveValue('2');
    await expect(page.locator('#gBotStyles select')).toHaveCount(2);
    await expect(page.locator('#gBotStyle0')).toHaveValue('smart');
    await expect(page.locator('#gBotStyle1')).toHaveValue('random');
    await expect(page.locator('#gBotLevel')).toHaveValue('hard');
    await expect(page.locator('#gMemoryOpt')).not.toBeChecked();
    await expect(page.locator('#gAssist')).toHaveValue('game');
    await expect(page.locator('#gSpeed')).toHaveValue('fast');
    await expect(page.locator('#gCalzaOpt')).toBeChecked();
    await expect(page.locator('#gPalificoOpt')).toBeChecked();
    await expect(page.locator('#gRevealOpt')).not.toBeChecked();
    await expect(page.locator('#gConfigSummary')).toContainText('4×3');       // сводка «Сейчас: …» тоже обновилась
    await expect(page.locator('#gAssistHelp')).toContainText('без шансов');   // пояснение к режиму помощи тоже

    await page.locator('#gSetup .side-start').click();                         // и партия действительно идёт по ним
    await expect(page.locator('#gameTable .seat')).toHaveCount(3);
    expect(await page.evaluate(() => window.__perudo_v2.game.players[0].dice)).toBe(4);
  });

  test('имена за столом не повторяются, имя игрока ботам не достаётся', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('perudo.player', JSON.stringify({ name: 'Сергей', avatar: null })));
    await page.locator('#gBots').fill('5');
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(6);
    for (let i = 0; i < 15; i++) {
      const names = await page.evaluate(() => {
        window.__perudo_v2.startNewGame();
        return window.__perudo_v2.game.players.map((p) => p.name);
      });
      expect(names.length).toBe(6);
      expect(new Set(names.map((n) => n.toLowerCase())).size, `повтор имён: ${names}`).toBe(6);
      expect(names[0]).toBe('Сергей');
    }
  });

  // ----- Продолжение партии после перезагрузки -----
  const activeSaved = (page) => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('perudo.activeGame')); } catch { return null; }
  });
  const humanTurn = (page) => page.waitForFunction(() => {
    const g = window.__perudo_v2.game;
    return g && g.state === 'active' && g.currentPlayer === 0;
  }, null, { timeout: 15_000 });
  const stateOf = (page) => page.evaluate(() => {
    const g = window.__perudo_v2.game;
    return {
      id: g.id, round: g.round, current: g.currentPlayer, bid: g.bid && { q: g.bid.q, f: g.bid.f, by: g.bid.playerId },
      players: g.players.map((p) => ({ name: p.name, dice: p.dice, hand: p.hand, alive: p.alive, style: p.style })),
    };
  });
  const startFastGame = async (page, bots = 3) => {
    await page.locator('#gBots').fill(String(bots));
    await page.locator('#gSpeed').selectOption('fast');
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(bots + 1);
    await humanTurn(page);
  };

  test('партия после перезагрузки: карточка «Продолжить» возвращает ту же партию', async ({ page }) => {
    await startFastGame(page);
    // Делаем ход, дожидаемся ответов ботов и снова своего хода: в снимке есть ставки, журнал и «Разбор».
    await page.evaluate(() => document.querySelector('#gRaise').click());
    await humanTurn(page);
    const before = await stateOf(page);
    const logRows = await page.locator('#gHistory .log-row').count();
    expect((await activeSaved(page)).game.round).toBe(before.round);

    await reloadToSetup(page);
    const card = page.locator('#gResume');
    await expect(card).toBeVisible();
    await expect(page.locator('#gResumeInfo')).toContainText(`Раунд ${before.round}`);
    await page.locator('#gResumeBtn').click();

    await expect(page.locator('#gSetup')).toBeHidden();
    await expect(page.locator('#gameTable .seat')).toHaveCount(4);
    const after = await stateOf(page);
    expect(after.round).toBe(before.round);
    expect(after.current).toBe(0);
    expect(after.bid).toEqual(before.bid);
    expect(after.players.map((p) => [p.dice, p.hand, p.alive, p.style]))
      .toEqual(before.players.map((p) => [p.dice, p.hand, p.alive, p.style]));
    expect(after.players.slice(1).map((p) => p.name)).toEqual(before.players.slice(1).map((p) => p.name));
    await expect(page.locator('#gHistory .log-row')).toHaveCount(logRows + 1);       // + «Партия продолжена…»
    await expect(page.locator('#gHistory')).toContainText('продолжена после перезагрузки');
    await expect(page.locator('#gDock')).toBeVisible();
    await expect(page.locator('#gResume')).toBeHidden();

    // Партия живая: ход принимается, боты отвечают.
    await page.locator('#gRaise').click();
    await expect(async () => {
      expect((await stateOf(page)).bid).not.toEqual(before.bid);
    }).toPass({ timeout: 10_000 });
  });

  test('после перезагрузки в ход бота партия идёт дальше сама', async ({ page }) => {
    await startFastGame(page, 2);
    await page.evaluate(() => document.querySelector('#gRaise').click());
    // сохраняем момент, когда ходит бот
    await page.waitForFunction(() => {
      const g = window.__perudo_v2.game;
      return g && g.state === 'active' && g.currentPlayer !== 0;
    });
    await reloadToSetup(page);
    await page.locator('#gSpeed').selectOption('fast');
    const snapRound = (await activeSaved(page)).game.round;
    await page.locator('#gResumeBtn').click();
    await expect(async () => {
      const g = await stateOf(page);
      expect(g.current === 0 || g.round > snapRound).toBe(true);                     // боты доиграли до вашего хода
    }).toPass({ timeout: 15_000 });
  });

  test('«Начать заново» стирает снимок; «Начать партию» тоже заменяет его', async ({ page }) => {
    await startFastGame(page);
    const firstId = (await activeSaved(page)).game.id;
    await reloadToSetup(page);
    await expect(page.locator('#gResume')).toBeVisible();
    await page.locator('#gResumeDrop').click();
    await expect(page.locator('#gResume')).toBeHidden();
    expect(await activeSaved(page)).toBeNull();
    await reloadToSetup(page);
    await expect(page.locator('#gResume')).toBeHidden();

    // обычный старт новой партии поверх незавершённой
    await startFastGame(page);
    await reloadToSetup(page);
    await expect(page.locator('#gResume')).toBeVisible();
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(4);
    const second = await activeSaved(page);
    expect(second.game.id).not.toBe(firstId);
  });

  test('законченная партия не предлагается к продолжению', async ({ page }) => {
    await page.locator('#gDice').fill('1');
    await page.locator('#gBots').fill('1');
    await page.locator('#gRevealOpt').setChecked(false);
    await page.locator('#gSpeed').selectOption('fast');
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(2);
    // доигрываем: игрок каждый раз поднимает/проверяет, пока кто-то не выбудет
    await expect(async () => {
      const done = await page.evaluate(() => window.__perudo_v2.game.state === 'finished');
      if (!done) {
        await page.evaluate(() => {
          const g = window.__perudo_v2.game;
          if (g.state === 'active' && g.currentPlayer === 0) {
            const dudo = document.querySelector('#gDudo');
            if (g.bid && dudo && !dudo.disabled) dudo.click(); else document.querySelector('#gRaise')?.click();
          }
        });
      }
      expect(done).toBe(true);
    }).toPass({ timeout: 60_000, intervals: [200] });
    expect(await activeSaved(page)).toBeNull();
    await reloadToSetup(page);
    await expect(page.locator('#gResume')).toBeHidden();
  });

  test('повреждённый снимок игнорируется, страница работает', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const bad of ['{не json', JSON.stringify({ v: 1, savedAt: Date.now(), game: { state: 'active' } }), JSON.stringify([1, 2])]) {
      await page.evaluate((v) => localStorage.setItem('perudo.activeGame', v), bad);
      await reloadToSetup(page);
      await expect(page.locator('#gResume')).toBeHidden();
    }
    await page.locator('#gSetup .side-start').click();
    await expect(page.locator('#gameTable .seat')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('изменённые, но не начатые настройки не запоминаются', async ({ page }) => {
    await page.locator('#gBots').fill('5');
    await page.locator('#gDice').fill('2');
    await reloadToSetup(page);
    await expect(page.locator('#gBots')).toHaveValue('3');
    await expect(page.locator('#gDice')).toHaveValue('5');
    expect(await lastGame(page)).toBeNull();
  });

  test('«Сбросить к стандартным» прячется при стандартных настройках, возвращает значения и забывает сохранённое', async ({ page }) => {
    const reset = page.locator('#gSettingsReset');
    await expect(reset).toBeHidden();
    await page.locator('#gBots').fill('2');
    await page.locator('#gCalzaOpt').check();
    await expect(reset).toBeVisible();
    await page.locator('#gSetup .side-start').click();
    await reloadToSetup(page);
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(page.locator('#gBots')).toHaveValue('3');
    await expect(page.locator('#gCalzaOpt')).not.toBeChecked();
    await expect(reset).toBeHidden();
    expect(await lastGame(page)).toBeNull();
    await reloadToSetup(page);
    await expect(page.locator('#gBots')).toHaveValue('3');
  });

  test('«Объяснения»: выбор запоминается после партии и перезагрузки, пояснение меняется с режимом помощи', async ({ page }) => {
    await expect(page.locator('#gExplain')).toHaveValue('auto');
    await expect(page.locator('#gExplainDepth')).toHaveValue('short');
    await expect(page.locator('#gExplainHelp')).toContainText('Сейчас: после хода');   // Тренировка по умолчанию
    await page.locator('#gAssist').selectOption('novice');
    await expect(page.locator('#gExplainHelp')).toContainText('Сейчас: до и после хода');
    await page.locator('#gAssist').selectOption('game');
    await expect(page.locator('#gExplainHelp')).toContainText('Сейчас: выключены');
    await page.locator('#gExplain').selectOption('full');
    await expect(page.locator('#gExplainHelp')).toContainText('после окончания партии');
    await page.locator('#gExplainDepth').selectOption('detailed');
    await expect(page.locator('#gSettingsReset')).toBeVisible();
    await page.locator('#gSetup .side-start').click();
    const saved = await lastGame(page);
    expect(saved).toMatchObject({ assist: 'game', explain: 'full', explainDepth: 'detailed', hideStyles: true });
    await reloadToSetup(page);
    await expect(page.locator('#gExplain')).toHaveValue('full');
    await expect(page.locator('#gExplainDepth')).toHaveValue('detailed');
    await page.locator('#gSettingsReset').click();
    await expect(page.locator('#gExplain')).toHaveValue('auto');
    await expect(page.locator('#gExplainDepth')).toHaveValue('short');
  });

  test('повреждённые сохранённые настройки не ломают страницу: берутся стандартные', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluate(() => localStorage.setItem('perudo.settings', JSON.stringify({
      lastGame: { dice: 999, bots: 'много', botStyles: ['nope', 5], assist: 'cheat', speed: 7, calza: 'да' },
    })));
    await reloadToSetup(page);
    await expect(page.locator('#gDice')).toHaveValue('10');                    // зажато в допустимый предел
    await expect(page.locator('#gBots')).toHaveValue('3');
    await expect(page.locator('#gAssist')).toHaveValue('training');
    await expect(page.locator('#gSpeed')).toHaveValue('normal');
    await expect(page.locator('#gCalzaOpt')).not.toBeChecked();
    expect(errors).toEqual([]);
  });

  test('после смены вкладки экран подготовки остаётся, настройки не сбрасываются', async ({ page }) => {
    await page.locator('#gBots').fill('2');
    await goTab(page, 'stats');
    await goTab(page, 'game');
    await expect(page.locator('#gSetup')).toBeVisible();
    await expect(page.locator('#gBots')).toHaveValue('2');
    await expect(page.locator('#gSide')).toBeHidden();
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

  test('запись «Разбора» хранит размер руки, подходящие кубики и шанс с учётом стола', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 3 });
    await waitMyTurn(page);
    await rigBots(page, [2, 2, 2]);

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(2).click(); // грань 3
    await page.locator('#gRaise').click();

    const e = await page.evaluate(() => window.__perudo_v2.reviews[0]);
    expect(e.kind).toBe('raise');
    expect(e.handSize).toBe(3);
    expect(Number.isInteger(e.ownMatch)).toBe(true);
    // первая ставка раунда: ставок за столом ещё нет, обе вероятности совпадают
    expect(e.probRead).toBeCloseTo(e.prob, 10);
    expect(e.trust).toBe(0.2);

    // на экране: запись есть, второго числа нет (до вас никто не ставил), подпись описывает оба числа
    await openTab(page, 'tabLog');   // на телефоне «Разбор» открывается из шторки, где уже видны вкладки
    await page.locator('#tabReview').click();
    await expect(page.locator('#gReview .review-row')).toHaveCount(1);
    await expect(page.locator('#gReview')).not.toContainText('с учётом ставок за столом');
    await expect(page.locator('#gReviewNote')).toContainText('с учётом ставок за столом');
  });

  test('журнал: потеря последнего кубика — запись о выбывании', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 1 });
    await waitMyTurn(page);
    await rigBots(page, [2]);

    await setQuantity(page, 1);
    await page.locator('#gPick button').nth(1).click(); // грань 2
    await page.locator('#gRaise').click();
    await waitBotBid(page);
    await page.locator('#gDudo').click();

    await openTab(page, 'tabLog');
    await expect(page.locator('#gHistory .log-elim')).toHaveCount(1);
    await expect(page.locator('#gHistory .log-elim')).toContainText(/выбыва/);
    await expect(page.locator('#gHistory .log-elim')).toContainText('без кубиков');
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
    await startGame(page, { bots: 2, dice: 3, styles: ['skeptic', 'aggressor'], showStyles: true });
    const styles = await page.evaluate(() => window.__perudo_v2.game.players.slice(1).map((p) => p.style));
    expect(styles).toEqual(['skeptic', 'aggressor']);
    await expect(page.locator('#gameTable .seat-style')).toHaveText(['🧐', '🔥']);
  });

  test('стили ботов скрыты по умолчанию: значков нет, настройка запомнена', async ({ page }) => {
    await expect(page.locator('#gShowStylesOpt')).not.toBeChecked();
    await startGame(page, { bots: 2, dice: 3, styles: ['skeptic', 'aggressor'] });
    await expect(page.locator('#gameTable .seat')).toHaveCount(3);
    await expect(page.locator('#gameTable .seat-style')).toHaveCount(0);
    expect(await page.locator('#gameTable').innerHTML()).not.toMatch(/🧐|🔥|🛡|🎭|🧠/u);
    expect((await lastGame(page)).hideStyles).toBe(true);
  });

  test('показ стилей включается переключателем, запоминается и возвращается после перезагрузки', async ({ page }) => {
    await startGame(page, { bots: 2, dice: 3, styles: ['skeptic', 'aggressor'], showStyles: true });
    expect((await lastGame(page)).hideStyles).toBe(false);
    await reloadToSetup(page);
    await expect(page.locator('#gShowStylesOpt')).toBeChecked();
    await expect(page.locator('#gSettingsReset')).toBeVisible();
    await page.locator('#gSettingsReset').click();
    await expect(page.locator('#gShowStylesOpt')).not.toBeChecked();
  });

  test('переключатель посреди партии стили не раскрывает, а в конце партии они появляются', async ({ page }) => {
    await startGame(page, { bots: 1, dice: 1, styles: ['skeptic'] });
    await waitMyTurn(page);
    await openSettings(page);
    await page.locator('#gShowStylesOpt').setChecked(true);
    await page.keyboard.press('Escape');   // на телефоне закрывает шторку настроек
    await page.evaluate(() => { const g = window.__perudo_v2.game; g.players[0].hand = [2]; g.players[1].hand = [2]; });
    await expect(page.locator('#gameTable .seat-style')).toHaveCount(0);
    await setQuantity(page, 2);
    await page.locator('#gPick button').nth(5).click();
    await page.locator('#gRaise').click();
    await expect.poll(() => page.evaluate(() => window.__perudo_v2.game.state), { timeout: 10_000 }).toBe('finished');
    await expect(page.locator('#gameTable .seat-style')).toHaveText(['🧐']);
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
    // контекст стола: вы и бот по одному кубику, ставок до вашего хода не было, стиль бота записан
    expect(m.ctx).toMatchObject({ me: 0, dice: [1, 1], bids: [] });
    expect(m.ctx.styles[0]).toBeNull();
    expect(m.ctx.styles[1]).toMatch(/^[a-z]+$/);

    // завершённый раунд сохранён целиком: руки, ставка, итог проверки
    const rounds = await readJson(page, 'perudo.rounds');
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      me: 0, wild: true, dice: [1, 1], hands: [[2], [2]], bids: [{ s: 0, q: 2, f: 6 }],
      end: { kind: 'dudo', by: 1, bidder: 0, actual: 0, ok: false },
    });

    const profile = await readJson(page, 'perudo.userProfile');
    expect(profile.byTag.raise).toEqual({ n: 1, good: 0 });
    expect(profile.byTag.endgame).toEqual({ n: 1, good: 0 });
  });

  test('окно итогов: «Перейти к расчёту» закрывает окно и показывает вкладку «Расчёт» с карточкой итога', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect(page.locator('#gResultDialog')).toHaveJSProperty('open', true, { timeout: 10_000 });
    // Уходим на другую вкладку: кнопка должна вернуть именно «Расчёт»
    await page.evaluate(() => { document.querySelector('#tabLog')?.click(); });
    await page.locator('#gResultCalc').click();
    await expect(page.locator('#gResultDialog')).toHaveJSProperty('open', false);
    await expect(page.locator('#tabCalc')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panCalc')).toBeVisible();
    await expect(page.locator('#gResultCard')).toBeVisible();
    await expect(page.locator('#gResultCard')).toBeFocused();
  });

  test('«Сбросить всё» стирает записанные решения и счётчики по меткам', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect.poll(async () => (await readJson(page, 'perudo.reviews'))?.length ?? 0, { timeout: 10_000 }).toBe(1);

    await page.evaluate(() => { document.querySelector('#gResultDialog')?.close?.(); });
    page.once('dialog', (d) => d.accept());
    await goTab(page, 'stats');
    await openStatsTab(page, 'data');
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

  test('итог партии: «Добавить в очередь повторов» только записывает ситуацию (без дублей), итог остаётся открытым', async ({ page }) => {
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
    await expect(replay).toHaveText('Добавить в очередь повторов');
    await replay.scrollIntoViewIfNeeded();
    await replay.click();
    const queue = () => readJson(page, 'perudo.trainingQueue');
    expect(await queue()).toHaveLength(1);

    // Тренажёр не открывается: остаёмся в итоге партии, остальные моменты не пропадают.
    await expect(page.locator('#train')).toBeHidden();
    await expect(card.locator('.key-moments')).toBeVisible();
    await expect(replay).toHaveText('В очереди повторов ✓');
    await expect(replay).toBeDisabled();

    // Повторное нажатие не создаёт дубль.
    await page.evaluate(() => document.querySelector('.key-moment-replay')?.click());
    expect(await queue()).toHaveLength(1);

    // В тренажёре ситуация ждёт в очереди повторов.
    await page.evaluate(() => { document.querySelector('#gResultDialog')?.close?.(); });
    await page.evaluate(() => document.querySelector('.tab-btn[data-t="train"]').click());   // шторка итога на телефоне перекрывает меню
    await expect(page.locator('#tStat')).toContainText('В очереди повторов: 1');
  });

  test('первый ход в раунде (без чужой ставки) в тренажёр не переносится', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loseWithBluff(page);
    await expect(page.locator('#gResultCard .key-moment')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('#gResultCard .key-moment-replay')).toHaveCount(0);
  });

  const setPlayer = (page, player) => page.evaluate((v) => localStorage.setItem('perudo.player', JSON.stringify(v)), player);

  test('имя и аватар из профиля показываются у вашего места; без профиля — «Вы»', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await startGame(page, { bots: 2 });
    await expect(page.locator('.seat.human .seat-name')).toHaveText('Вы');
    await expect(page.locator('.seat.human .seat-avatar svg')).toHaveCount(1);

    await setPlayer(page, { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } });
    await startGame(page, { bots: 2 });
    await expect(page.locator('.seat.human .seat-name')).toHaveText('Анна');
    await expect(page.locator('.seat.human .seat-emoji')).toHaveText('🦊');
    await expect(page.locator('.seat:not(.human) .seat-emoji')).toHaveCount(0);     // у ботов свои аватары
  });

  test('имя, заданное посреди партии, сразу появляется за столом', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await startGame(page, { bots: 1 });
    await goTab(page, 'stats');
    await openStatsTab(page, 'player');
    await page.locator('#plName').fill('Борис');
    await openAvatarPicker(page);
    await page.locator('#plEmojis [data-emoji="🐼"]').click();
    await goTab(page, 'game');
    await expect(page.locator('.seat.human .seat-name')).toHaveText('Борис');
    await expect(page.locator('.seat.human .seat-emoji')).toHaveText('🐼');
  });

  test('разметка в имени не выполняется: ни за столом, ни в журнале', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await setPlayer(page, { name: '<svg/onload=__xss=1>' });
    await startGame(page, { bots: 1, dice: 1 });
    await expect(page.locator('.seat.human .seat-name')).toHaveText('<svg/onload=__xss=1>');
    await waitMyTurn(page);
    await page.evaluate(() => {
      const g = window.__perudo_v2.game;
      g.players[0].hand = [2];
      g.players[1].hand = [2];
      g.currentPlayer = 0;
      window.__perudo_v2.renderGame();
    });
    await setQuantity(page, 2);
    await page.locator('#gPick button').nth(5).click();
    await page.locator('#gRaise').click();
    await expect(page.locator('#gHistory')).toContainText(/НЕ ВЕРЮ/i, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('.seat-name svg, #gHistory svg').count()).toBe(0);
  });

  test.describe('Напоминание о копии и постоянное хранилище', () => {
    const seedGames = (page, totalGames, device) => page.evaluate(([n, dev]) => {
      localStorage.clear();
      localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 0, good: 0, totalGames: n, totalWins: 0, byMode: {},
        drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
      if (dev) localStorage.setItem('perudo.device', JSON.stringify({ account: 'guest', ...dev }));   // выбор «гость» сделан: окно выбора не мешает
    }, [totalGames, device]);
    const openResult = async (page) => {
      await page.evaluate(() => document.querySelector('#gResultDialog')?.close?.());
      await openTab(page, 'tabLog');                       // на телефоне открывает шторку с итогом
    };
    const device = (page) => readJson(page, 'perudo.device');

    test('до пятой партии напоминания нет', async ({ page }) => {
      await seedGames(page, 3);
      await loseByWrongDudo(page);                         // четвёртая партия
      await openResult(page);
      await expect(page.locator('#gResultCard .backup-reminder')).toHaveCount(0);
    });

    test('после пятой партии: «Сохранить копию» скачивает файл и откладывает напоминание на 30 партий', async ({ page }) => {
      await seedGames(page, 4);
      await loseByWrongDudo(page);
      await openResult(page);
      const box = page.locator('#gResultCard .backup-reminder');
      await expect(box).toContainText('Вы сыграли партий: 5');
      const [download] = await Promise.all([page.waitForEvent('download'), box.locator('[data-backup-save]').click()]);
      expect(download.suggestedFilename()).toMatch(/^perudo-backup-\d{4}-\d{2}-\d{2}\.json$/);
      await expect(box).toContainText('Копия сохранена');
      expect((await device(page)).nextAt).toBe(35);
    });

    test('«Позже» убирает напоминание и откладывает на 20 партий', async ({ page }) => {
      await seedGames(page, 4);
      await loseByWrongDudo(page);
      await openResult(page);
      await page.locator('#gResultCard [data-backup-later]').click();
      await expect(page.locator('#gResultCard .backup-reminder')).toHaveCount(0);
      expect((await device(page)).nextAt).toBe(25);
    });

    test('экспорт из «Статистики» тоже откладывает напоминание', async ({ page }) => {
      await seedGames(page, 6, { nextAt: 5, persistTries: 2 });
      await page.reload();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await Promise.all([page.waitForEvent('download'), page.locator('#stExport').click()]);
      expect((await device(page)).nextAt).toBe(36);
    });

    test('«Сбросить всё» начинает счёт заново', async ({ page }) => {
      await seedGames(page, 9, { nextAt: 39, persistTries: 2 });
      await page.reload();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      page.once('dialog', (d) => d.accept());
      await page.locator('#stClear').click();
      expect(await device(page)).toEqual({ nextAt: 5, persistTries: 2, account: 'guest' });
    });

    const stubStorage = (page, persisted) => page.addInitScript((p) => {
      window.__persistCalls = 0;
      const s = navigator.storage;
      s.persisted = async () => p.value;
      s.persist = async () => { window.__persistCalls++; p.value = true; return true; };
    }, { value: persisted });

    test('после первой партии просим постоянное хранилище; после второй уже нет', async ({ page }) => {
      await stubStorage(page, false);
      await seedGames(page, 0);
      await page.reload();
      await goTab(page, 'game');
      await loseByWrongDudo(page);
      await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBe(1);
      expect((await device(page)).persistTries).toBe(1);
      await page.evaluate(() => document.querySelector('#gResultDialog')?.close?.());
      await loseByWrongDudo(page);                         // вторая партия
      expect(await page.evaluate(() => window.__persistCalls)).toBe(1);
    });

    test('второй запрос — после пятой партии, третьего нет', async ({ page }) => {
      await stubStorage(page, false);
      await seedGames(page, 4, { nextAt: 99, persistTries: 1 });
      await page.reload();
      await goTab(page, 'game');
      await loseByWrongDudo(page);
      await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBe(1);
      expect((await device(page)).persistTries).toBe(2);
    });

    test('исчерпанные попытки: браузер больше не спрашиваем', async ({ page }) => {
      await stubStorage(page, false);
      await seedGames(page, 9, { nextAt: 99, persistTries: 2 });
      await page.reload();
      await goTab(page, 'game');
      await loseByWrongDudo(page);
      expect(await page.evaluate(() => window.__persistCalls)).toBe(0);
    });

    test('«Статистика» показывает, защищено ли хранилище', async ({ page }) => {
      await stubStorage(page, true);
      await page.reload();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#stPersist')).toContainText('защищено');
      await stubStorage(page, false);
      await page.reload();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#stPersist')).toContainText('Экспорт JSON');
    });
  });

  test.describe('Копия в облаке (Яндекс Диск подменён заглушкой)', () => {
    const { TOKEN, OLD, cloudFile, progress, stubYandex, seed } = yandex;
    const cloudState = (page) => readJson(page, 'perudo.cloud');

    test('вход через Яндекс: токен сохраняется, адрес очищается, токена нет в файле копии', async ({ page }) => {
      const cloud = await stubYandex(page);
      await seed(page, { games: 2, signedIn: false });
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await page.locator('#clLogin').click();
      await expect(page.locator('#clSave')).toBeVisible();
      expect(cloud.logins).toBe(1);
      expect(page.url()).not.toContain('access_token');
      expect((await cloudState(page)).token).toBe(TOKEN);
      // данные уже были, а в облаке пусто: копия записана сразу
      await expect.poll(() => cloud.puts).toBe(1);
      expect(cloud.text).not.toContain(TOKEN);
      expect(JSON.parse(cloud.text).format).toBe('perudo-backup');
      await expect(page.locator('#clStatus')).toContainText('Копия в облаке:');
    });

    test('вход с чужим state отклоняется: токен не сохраняется', async ({ page }) => {
      await stubYandex(page);
      await seed(page, { signedIn: false });
      await page.evaluate(() => localStorage.setItem('perudo.oauthState', 'ожидаемое'));
      await page.goto(`/#access_token=${TOKEN}&expires_in=100000&state=подмена`);
      await page.reload();                                 // смена одного хэша страницу не перезагружает
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clToast')).toContainText('Не удалось проверить ответ Яндекса');
      expect(await cloudState(page)).toBeNull();
      expect(page.url()).not.toContain('access_token');
    });

    test('отказ в доступе на странице Яндекса: понятное сообщение, вход не выполнен', async ({ page }) => {
      await seed(page, { signedIn: false });
      await page.goto('/#error=access_denied&state=x');
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clToast')).toContainText('Вход через Яндекс отменён');
      await expect(page.locator('#clLogin')).toBeVisible();
    });

    test('после партии копия пишется в облако, напоминание про файл не показывается', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(4) }) });
      await seed(page, { games: 4, synced: OLD });
      await goTab(page, 'game');
      await loseByWrongDudo(page);                         // пятая партия: без облака напомнили бы про файл
      await expect.poll(() => cloud.puts).toBe(1);
      expect(JSON.parse(cloud.text).exportedAt).toBeGreaterThan(OLD);
      expect(JSON.parse(cloud.text).data['perudo.userProfile'].totalGames).toBe(5);
      await page.evaluate(() => document.querySelector('#gResultDialog')?.close?.());
      await openTab(page, 'tabLog');
      await expect(page.locator('#gResultCard .backup-reminder')).toHaveCount(0);
      expect((await cloudState(page)).syncedExportedAt).toBeGreaterThan(OLD);
    });

    test('устройство пустое, в облаке копия: окно предлагает восстановить', async ({ page }) => {
      await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7), 'perudo.player': { name: 'Облако', avatar: null } }) });
      await seed(page, { games: 0 });
      await expect(page.locator('#clDialog')).toBeVisible();
      await expect(page.locator('#clDialogTitle')).toHaveText('Найдена копия данных');
      await page.locator('#clDialog [data-cl="restore"]').click();
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      await goTab(page, 'stats');
      await openStatsTab(page, 'player');
      await expect(page.locator('#plName')).toHaveValue('Облако');
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(7);
      expect((await cloudState(page)).token).toBe(TOKEN);                  // вход пережил восстановление
      expect((await cloudState(page)).syncedExportedAt).toBe(OLD);
      await expect(page.locator('#clDialog')).not.toBeVisible();
    });

    test('«Не сейчас»: окно закрыто, выбор остаётся в блоке «Игрок», запись заблокирована', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(7) }) });
      await seed(page, { games: 0 });
      await page.locator('#clDialog [data-cl="later"]').click();
      await expect(page.locator('#clDialog')).not.toBeVisible();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clPending')).toContainText('есть копия данных');
      await expect(page.locator('#clSave')).toBeDisabled();
      expect(cloud.puts).toBe(0);
    });

    test('данные есть и там и там: «Оставить это устройство» заменяет облако', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(9) }) });
      await seed(page, { games: 3 });
      await expect(page.locator('#clDialogTitle')).toHaveText('Какие данные оставить?');
      await page.locator('#clDialog [data-cl="keep"]').click();
      await expect.poll(() => cloud.puts).toBe(1);
      expect(JSON.parse(cloud.text).data['perudo.userProfile'].totalGames).toBe(3);
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(3);
    });

    test('данные есть и там и там: «Взять из облака» заменяет данные устройства', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(9) }) });
      await seed(page, { games: 3 });
      await page.locator('#clDialog [data-cl="restore"]').click();
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(9);
      expect(cloud.puts).toBe(0);
    });

    test('токен недействителен (401): «Войти снова», данные на устройстве целы', async ({ page }) => {
      await stubYandex(page, { mode: 401 });
      await seed(page, { games: 3, synced: OLD });
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clStatus')).toContainText('устарел');
      await expect(page.locator('#clLogin')).toHaveText('Войти снова');
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(3);
      await expect(page.locator('#gResultCard .backup-reminder')).toHaveCount(0);
    });

    test('нет связи: партия играется, в блоке «Игрок» короткое сообщение, вход сохраняется', async ({ page }) => {
      await stubYandex(page, { mode: 'offline' });
      page.removeAllListeners('requestfailed');
      await seed(page, { games: 3, synced: OLD });
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clToast')).toContainText('Нет связи');
      await goTab(page, 'game');
      await loseByWrongDudo(page);
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(4);
      expect((await cloudState(page)).token).toBe(TOKEN);
    });

    test('«Сохранить сейчас» пишет копию; «Выйти» удаляет токен, файл на Диске остаётся', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
      await seed(page, { games: 3, synced: OLD });
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await page.locator('#clSave').click();
      await expect(page.locator('#clMsg')).toContainText('Копия записана');
      expect(cloud.puts).toBe(1);
      page.once('dialog', (d) => d.accept());
      await page.locator('#clLogout').click();
      await expect(page.locator('#clLogin')).toBeVisible();
      expect((await cloudState(page)).token).toBe('');
      expect(cloud.text).not.toBeNull();
    });

    test('ошибка «чужая версия в облаке»: «Сохранить сейчас» не затирает копию с другого устройства', async ({ page }) => {
      // Так пропали данные при первой проверке: телефон записал копию, ноутбук заменил её кнопкой
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(1), 'perudo.player': { name: 'Руслан', avatar: null } }, OLD + 5000) });
      await seed(page, { games: 3, synced: OLD });
      await page.locator('#clDialog [data-cl="later"]').click();
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#clSave')).toBeDisabled();
      expect(cloud.puts).toBe(0);
      expect(JSON.parse(cloud.text).data['perudo.player'].name).toBe('Руслан');
    });

    test('копия в облаке изменилась после входа: «Сохранить сейчас» показывает выбор, а не пишет', async ({ page }) => {
      const cloud = await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(3) }) });
      await seed(page, { games: 3, synced: OLD });                      // при запуске версии совпали
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      cloud.text = cloudFile({ 'perudo.userProfile': progress(9), 'perudo.player': { name: 'Другое устройство', avatar: null } }, OLD + 9000);
      await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('perudo.userProfile')); p.totalGames = 4; localStorage.setItem('perudo.userProfile', JSON.stringify(p)); });
      await page.locator('#clSave').click();
      await expect(page.locator('#clDialog')).toBeVisible();
      expect(cloud.puts).toBe(0);
      await expect(page.locator('#clDialog')).toContainText('Другое устройство');
    });

    test('окно выбора показывает сводку обеих версий и умеет скачать файл этого устройства', async ({ page }) => {
      await stubYandex(page, { text: cloudFile({ 'perudo.userProfile': progress(9), 'perudo.player': { name: 'Облако', avatar: null } }) });
      await seed(page, { games: 3, extra: { 'perudo.player': { name: 'Телефон', avatar: null } } });
      const dlg = page.locator('#clDialog');
      await expect(dlg).toBeVisible();
      await expect(dlg).toContainText('Это устройство');
      await expect(dlg).toContainText('Телефон');
      await expect(dlg).toContainText('партий: 3');
      await expect(dlg).toContainText('Облако');
      await expect(dlg).toContainText('партий: 9');
      const [download] = await Promise.all([page.waitForEvent('download'), dlg.locator('[data-cl="download"]').click()]);
      expect(download.suggestedFilename()).toMatch(/^perudo-backup-\d{4}-\d{2}-\d{2}\.json$/);
      await expect(dlg).toBeVisible();                                    // окно остаётся: выбор ещё не сделан
    });

    test('устройство не менялось, на другом записана новая копия: данные подтягиваются без вопросов', async ({ page }) => {
      const cloud = await stubYandex(page);
      await seed(page, { games: 3, synced: null });
      await expect.poll(() => cloud.puts).toBe(1);                        // вход, облако пусто: копия записана
      // состояние входа записывается чуть позже самой отправки копии: ждём, а не читаем сразу
      await expect.poll(async () => (await cloudState(page)).syncedHash).toMatch(/^[0-9a-f]+$/);
      // «другое устройство» записало новую копию
      cloud.text = cloudFile({ 'perudo.userProfile': progress(8), 'perudo.player': { name: 'С ноутбука', avatar: null } }, Date.now() + 60_000);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      await expect(page.locator('#clDialog')).not.toBeVisible();
      await expect(page.locator('#clToast')).toContainText('Данные обновлены из облака');
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await expect(page.locator('#plName')).toHaveValue('С ноутбука');
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(8);
      expect(cloud.puts).toBe(1);
    });

    test('устройство менялось после синхронизации, а в облаке новее: спрашиваем, а не подтягиваем', async ({ page }) => {
      const cloud = await stubYandex(page);
      await seed(page, { games: 3, synced: null });
      await expect.poll(() => cloud.puts).toBe(1);
      cloud.text = cloudFile({ 'perudo.userProfile': progress(8) }, Date.now() + 60_000);
      await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('perudo.userProfile')); p.totalGames = 4; localStorage.setItem('perudo.userProfile', JSON.stringify(p)); });
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__perudo_v2));
      await expect(page.locator('#clDialogTitle')).toHaveText('Какие данные оставить?');
      expect((await readJson(page, 'perudo.userProfile')).totalGames).toBe(4);
    });

    test('вход завершён: заметное уведомление на вкладке «Статистика»', async ({ page }) => {
      await stubYandex(page);
      await seed(page, { signedIn: false });
      await goTab(page, 'stats');
      await openStatsTab(page, 'data');
      await page.locator('#clLogin').click();
      await expect(page.locator('#clToast')).toContainText('Вход выполнен');
    });
  });
});
