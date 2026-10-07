// tests/e2e/table.spec.js
import { test, expect } from '@playwright/test';

test.describe('Покерный стол в партии', () => {
  test.beforeEach(async ({ page }) => {
    // Логируем ошибки JS, но НЕ бросаем из обработчика — иначе Playwright
    // может странно вести себя с оставшимися действиями теста.
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));

    await page.goto('/');

    // Точный селектор по data-атрибуту, а не по тексту.
    await page.locator('.tab-btn[data-t="game"]').click();

    // Ждём, пока секция партии и её поля действительно станут видимыми.
    await expect(page.locator('#game')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#gBots')).toBeVisible({ timeout: 5_000 });
  });

  test('новая партия рисует стол, места игроков и центральную ставку', async ({ page }) => {
    // Меняем настройки: 3 бота, 3 кубика
    await page.locator('#gBots').fill('3');
    await page.locator('#gDice').fill('3');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    // Стол появился
    await expect(page.locator('#gameTable .game-table')).toBeVisible();

    // Четыре места: игрок + 3 бота
    await expect(page.locator('#gameTable .seat')).toHaveCount(4);

    // Центр стола с раундом и числом кубиков
    await expect(page.locator('#gameTable .table-center')).toContainText('Раунд');
    await expect(page.locator('#gameTable .table-center')).toContainText('12'); // 4 × 3

    // Активного игрока подсвечивает .active
    await expect(page.locator('#gameTable .seat.active')).toHaveCount(1);
  });

  test('игрок может поставить, стол обновляет ставку', async ({ page }) => {
    // Логируем всё, что пишет браузер, и все JS-ошибки
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    await page.locator('#gBots').fill('2');
    await page.locator('#gDice').fill('2');
    await page.locator('#gNew').click();

    // Ждём наш ход
    await page.waitForFunction(() =>
      document.querySelector('#gStatus')?.textContent?.includes('Ваш ход')
      , { timeout: 10_000 });

    // Явные проверки, что всё готово к ставке
    await expect(page.locator('#gRaise')).toBeEnabled({ timeout: 5_000 });
    await expect(page.locator('#gPick button')).toHaveCount(6);

    // Ставим 1 × грань 3
    await page.locator('#gQ').fill('1');
    await page.locator('#gPick button').nth(2).click();

    const prevBefore = await page.locator('#gPrev').textContent();
    console.log('[TEST] gPrev до клика:', JSON.stringify(prevBefore));

    await page.locator('#gRaise').click();

    // Снимок состояния сразу после клика
    const snap1 = await page.evaluate(() => {
      const g = window.__perudo_v2?.game;
      return {
        gameState: g?.state,
        currentPlayer: g?.currentPlayer,
        bid: g?.bid,
        qValue: document.querySelector('#gQ')?.value,
        raiseDisabled: document.querySelector('#gRaise')?.disabled,
        tableBidText: document.querySelector('#gameTable .table-bid')?.textContent,
      };
    });
    console.log('[TEST] после клика:', JSON.stringify(snap1, null, 2));

    // Через 300 мс — не успел ли бот ответить и обнулить bid
    await page.waitForTimeout(300);
    const snap2 = await page.evaluate(() => {
      const g = window.__perudo_v2?.game;
      return {
        gameState: g?.state,
        currentPlayer: g?.currentPlayer,
        bid: g?.bid,
        tableBidText: document.querySelector('#gameTable .table-bid')?.textContent,
      };
    });
    console.log('[TEST] через 300 мс:', JSON.stringify(snap2, null, 2));

    console.log('[TEST] browser console:');
    for (const l of logs) console.log('   ', l);

    // Оригинальная проверка
    await expect(page.locator('#gameTable .table-bid')).toContainText('1');
  });

  test('кнопка «Не верю» завершает раунд и обновляет стол', async ({ page }) => {
    await page.locator('#gBots').fill('1');
    await page.locator('#gDice').fill('2');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    // 1. Игрок всегда ходит первым — ждём его ход.
    await page.waitForFunction(() => {
      return document.querySelector('#gStatus')?.textContent?.includes('Ваш ход');
    }, { timeout: 10_000 });

    // 2. Делаем бота детерминированным: с двумя «2» он гарантированно
    //    повышает на нашу ставку 1×2, а не вызывает dudo.
    //    Без этого шага бот ~50% раз сразу говорил «Не верю»,
    //    и тест скипался через test.skip().
    //
    //    own(hand, 2, wild=true) = 2 → need = 1 − 2 = −1 → probBid = 1.
    //    p = 1 > dudoBelow у любого стиля → raise.
    await page.evaluate(() => {
      const g = window.__perudo_v2?.game;
      if (!g) return;
      for (let i = 1; i < g.players.length; i++) {
        g.players[i].hand = [2, 2];
      }
    });

    // 3. Делаем безопасно низкую ставку 1 × грань 2.
    await page.locator('#gQ').fill('1');
    await page.locator('#gPick button').nth(1).click();  // индекс 1 = грань 2
    await page.getByRole('button', { name: 'Ставлю' }).click();

    // 4. Ждём ответа бота: он обязательно повысит, и ход вернётся к нам.
    //    Условие строгое — не только «Ваш ход», но и что на столе чужая ставка.
    await page.waitForFunction(() => {
      const g = window.__perudo_v2?.game;
      const s = document.querySelector('#gStatus')?.textContent || '';
      return s.includes('Ваш ход')
        && g?.bid
        && g.bid.playerId !== 'human';
    }, { timeout: 10_000 });

    // 5. Наш ход — жмём «Не верю!»
    await page.getByRole('button', { name: 'Не верю!' }).click();

    // 6. Журнал партии: появилась запись «НЕ ВЕРЮ».
    await expect(page.locator('#gHistory')).toContainText(/НЕ ВЕРЮ/i, { timeout: 5_000 });

    // 7. P1.7: проверяем, что результат Dudo действительно попал в журнал
    //    через res.events из нового applyAction (а не через устаревший
    //    game.events.slice(beforeLen)).
    await expect(page.locator('#gHistory')).toContainText(/Проверка/i);
  });

  test('режим «Игра» не показывает проценты на столе', async ({ page }) => {
    await page.selectOption('#gAssist', 'game');
    await page.locator('#gBots').fill('2');
    await page.locator('#gDice').fill('2');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    // Ждём наш ход
    await page.waitForFunction(() => {
      return document.querySelector('#gStatus')?.textContent?.includes('Ваш ход');
    });

    // В блоке #gPrev не должно быть знака % — в честном режиме подсказок нет
    const prev = await page.locator('#gPrev').textContent();
    expect(prev || '').not.toMatch(/%/);

    // И в карточке текущей ставки тоже
    const bidCard = await page.locator('#gBid').textContent();
    expect(bidCard || '').not.toMatch(/шанс/i);
  });
  test('режим «Новичок» показывает прямую рекомендацию', async ({ page }) => {
    await page.selectOption('#gAssist', 'novice');
    await page.locator('#gBots').fill('2');
    await page.locator('#gDice').fill('3');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    // 1. Ждём свой ход.
    //    На первом ходу раунда #gAdvice ещё пуст — совет появляется
    //    только когда на столе есть чужая ставка. Поэтому сначала
    //    проверяем #gPractical, который считается независимо от bid.
    await page.waitForFunction(() =>
      document.querySelector('#gStatus')?.textContent?.includes('Ваш ход')
    );

    // 2. #gPractical показывается сразу в Новичке (по флагу showFutureBidOdds).
    //    Это пошаговый расчёт безопасной ставки для выбранной грани.
    await expect(page.locator('#gPractical')).toBeVisible();
    await expect(page.locator('#gPractical')).toContainText(/Быстрый расчёт|Безопасная ставка/);

    // 3. Делаем безопасно низкую ставку 1×2, чтобы бот её повысил,
    //    а не сразу проверил. Это гарантирует появление чужой ставки
    //    и, соответственно, непустой #gAdvice.
    await page.locator('#gQ').fill('1');
    await page.locator('#gPick button').nth(1).click();   // индекс 1 = грань 2
    await page.locator('#gRaise').click();

    // 4. Ждём, пока ОБА бота ответят и ход снова вернётся к нам,
    //    И при этом bid будет от не-human. Это предусловие для #gAdvice.
    await page.waitForFunction(() => {
      const g = window.__perudo_v2?.game;
      const s = document.querySelector('#gStatus')?.textContent || '';
      return s.includes('Ваш ход')
        && g?.bid
        && g.bid.playerId !== 'human';
    }, { timeout: 10_000 });

    // 5. Теперь #gAdvice содержит одну из двух формулировок:
    //    «Лучше сказать “Не верю”» или «Ставка вероятна — лучше повысить».
    //    «Безопасная ставка» из #gAdvice убрана (вариант 2) —
    //    за неё отвечает #gPractical, проверенный выше.
    const advice = page.locator('#gAdvice');
    await expect(advice).toBeVisible();
    await expect(advice).toContainText(/Лучше сказать «Не верю»|Ставка вероятна/);
  });

  test('режим «Игра» не показывает прямые советы', async ({ page }) => {
    await page.selectOption('#gAssist', 'game');
    await page.locator('#gBots').fill('2');
    await page.locator('#gDice').fill('2');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    await page.waitForFunction(() =>
      document.querySelector('#gStatus')?.textContent?.includes('Ваш ход')
    );

    await expect(page.locator('#gAdvice')).toBeEmpty();
  });

  test('Calza: доступна при включённой опции, скрыта при выключенной', async ({ page }) => {
    // Сценарий A: опция выключена — кнопка скрыта классом .hide
    await page.locator('#gCalzaOpt').uncheck();
    await page.getByRole('button', { name: 'Новая партия' }).click();
    await expect(page.locator('#gCalza')).toHaveClass(/hide/);

    // Сценарий B: опция включена, начинаем новую партию
    await page.locator('#gCalzaOpt').check();
    await page.locator('#gBots').fill('2');
    await page.locator('#gDice').fill('3');
    await page.getByRole('button', { name: 'Новая партия' }).click();

    // 1. Ждём, пока партия создана и ход перешёл к игроку.
    await page.waitForFunction(() =>
      document.querySelector('#gStatus')?.textContent?.includes('Ваш ход')
    );

    // 2. Кнопка видима, но пока ставки нет — disabled.
    await expect(page.locator('#gCalza')).not.toHaveClass(/hide/);
    await expect(page.locator('#gCalza')).toBeDisabled();

    // ↓↓↓ ВСТАВИТЬ ЗДЕСЬ ↓↓↓
    //
    // Подменяем руки ботов, чтобы каждый из них гарантированно повышал,
    // а не вызывал Dudo. Иначе после нашей ставки 1×2 бот может сказать
    // «Не верю», раунд перезапустится, ставки снова не будет —
    // и #gCalza останется disabled.
    //
    // Даём каждому боту руку [2, 3, 4]:
    //   own(hand, 2, wild=true) = 1  (одна «2»)
    //   need = 1 - 1 = 0 → probBid(1, 2, ...) = 1
    //   p = 1 > dudoBelow у любого стиля → raise
    await page.evaluate(() => {
      const g = window.__perudo_v2?.game;
      if (!g) return;
      for (let i = 1; i < g.players.length; i++) {
        g.players[i].hand = [2, 3, 4];
      }
    });
    // ↑↑↑ КОНЕЦ ВСТАВКИ ↑↑↑

    // 3. Ставим 1 × грань 2 — это индекс 1, НЕ 0.
    await page.locator('#gQ').fill('1');
    await page.locator('#gPick button').nth(1).click();
    await page.locator('#gRaise').click();

    // Ставка должна пройти — проверим, что в #gPrev нет слова «недопустима».
    await expect(page.locator('#gPrev')).not.toContainText(/недопустима/i);

    // 4. Ждём, пока ОБА бота ответят и ход снова вернётся к нам.
    //    Проверяем не только статус, но и что bid принадлежит не нам —
    //    это и есть предусловие для активной Calza.
    await page.waitForFunction(() => {
      const s = document.querySelector('#gStatus')?.textContent || '';
      const g = window.__perudo_v2?.game;
      return s.includes('Ваш ход')
        && g?.bid
        && g.bid.playerId !== 'human';
    }, { timeout: 10_000 });

    // 5. Теперь Calza должна быть активна.
    await expect(page.locator('#gCalza')).toBeEnabled();
  });
});