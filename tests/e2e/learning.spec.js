// tests/e2e/learning.spec.js
// Дымовые сценарии учебных вкладок: Калькулятор, Тренажёр, Упражнения.
// Страхуют переделку вёрстки: после неё вкладки должны делать то же самое.
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openTab, openStatsTab, openAvatarPicker } from './helpers.js';

async function open(page, tab) {
  await openTab(page, tab);
}

test.describe('Учебные вкладки', () => {
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.afterEach(() => {
    expect(errors, 'на странице нет ошибок JavaScript и сетевых ошибок').toEqual([]);
  });

  test.describe('Калькулятор', () => {
    test('показывает шанс и вердикт для ставки по умолчанию', async ({ page }) => {
      await open(page, 'calc');
      const res = page.locator('#cRes');
      await expect(res).toContainText('44.1%');           // рука 1,3,5,5,6; 15 кубиков; ставка 7×5
      await expect(res).toContainText('НЕ ВЕРЮ');
    });

    test('вердикт меняется вместе со ставкой', async ({ page }) => {
      await open(page, 'calc');
      await page.fill('#cQ', '3');
      await expect(page.locator('#cRes')).toContainText('ВЕРЮ / можно');
      await page.fill('#cQ', '12');
      await expect(page.locator('#cRes')).toContainText('НЕ ВЕРЮ');
    });

    test('степпер и выбор цифры меняют ставку и результат', async ({ page }) => {
      await open(page, 'calc');
      const res = page.locator('#cRes');
      await expect(page.locator('#cPick .face-btn[aria-checked="true"]')).toHaveAttribute('aria-label', 'Цифра 5');
      await page.click('#cMinus');
      await expect(page.locator('#cQ')).toHaveValue('6');
      await page.click('#cPlus');
      await page.click('#cPlus');
      await expect(page.locator('#cQ')).toHaveValue('8');
      await page.click('#cMinus');
      await page.click('#cPick .face-btn[aria-label="Цифра 2"]');
      await expect(page.locator('#cF')).toHaveValue('2');
      await expect(page.locator('#cPick .face-btn[aria-checked="true"]')).toHaveAttribute('aria-label', 'Цифра 2');
      await expect(res).toContainText('НЕ ВЕРЮ');
      await page.fill('#cQ', '1');
      await page.click('#cMinus');
      await expect(page.locator('#cQ')).toHaveValue('1');   // ниже единицы не уходит
    });

    test('ставка и результат видны одновременно, страница не прокручивается вбок', async ({ page }) => {
      await open(page, 'calc');
      const vh = page.viewportSize().height;
      for (const sel of ['#cQ', '#cPick', '#cRes']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.y + b.height, `${sel} в пределах экрана`).toBeLessThanOrEqual(vh + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('«Чтение чужих ставок» лежит в панели ставки: на широком экране раскрыто, на телефоне свёрнуто и открывается', async ({ page }) => {
      await open(page, 'calc');
      const box = page.locator('#cReadBox');
      expect(await box.evaluate((el) => el.closest('#cDock') !== null)).toBe(true);
      const wide = page.viewportSize().width >= 720;
      expect(await box.evaluate((el) => el.open)).toBe(wide);
      await box.locator('summary').click();
      if (wide) await box.locator('summary').click();      // на широком раскрыто с начала: закрыли, открываем снова
      await expect(page.locator('#cK')).toBeVisible();
      const before = await page.locator('#cRead').innerText();
      await page.locator('#cK').fill('6');
      await expect(page.locator('#cRead')).not.toHaveText(before);
    });

    test('рука собирается кнопками «+», «Убрать последний» и «Очистить»', async ({ page }) => {
      await open(page, 'calc');
      const dice = page.locator('#cHand .die');
      await page.click('#cClr');
      await expect(dice).toHaveCount(0);
      await page.locator('#cPad button', { hasText: '+5' }).click();
      await page.locator('#cPad button', { hasText: '+2' }).click();
      await expect(dice).toHaveCount(2);
      await page.click('#cUndo');
      await expect(dice).toHaveCount(1);
      await page.click('#cRnd');
      await expect(dice).toHaveCount(5);
    });

    test('таблица лучших ставок содержит строку на каждую цифру', async ({ page }) => {
      await open(page, 'calc');
      await expect(page.locator('#cTbl tr')).toHaveCount(7);   // заголовок и шесть цифр
    });
  });

  test.describe('Тренажёр', () => {
    test('ответ «Не верю!» даёт разбор, «Новая ситуация» его убирает', async ({ page }) => {
      await open(page, 'train');
      await expect(page.locator('#tHand .die')).not.toHaveCount(0);
      await expect(page.locator('#tFb')).toBeEmpty();

      await page.click('#tDudo');
      await expect(page.locator('#tFb')).toContainText('решение');
      await expect(page.locator('#tFb')).toContainText('Шанс');

      await page.click('#tNext');
      await expect(page.locator('#tFb')).toBeEmpty();
    });

    test('после ответа разбор и «Новая ситуация» видны без прокрутки', async ({ page }) => {
      await open(page, 'train');
      await page.click('#tDudo');
      const vh = page.viewportSize().height;
      for (const sel of ['#tFb', '#tNext']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.y, `${sel} не выше экрана`).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height, `${sel} в пределах экрана`).toBeLessThanOrEqual(vh + 1);
      }
      await expect(page.locator('#tDudo')).toBeHidden();
      await expect(page.locator('#tNew')).toBeHidden();
      await page.click('#tNext');
      await expect(page.locator('#tDudo')).toBeVisible();
      await expect(page.locator('#tNext')).toBeHidden();
    });

    test('после «Не верю!» показаны варианты хода, выбранный отмечен', async ({ page }) => {
      await open(page, 'train');
      await page.click('#tDudo');
      const rows = page.locator('#tFb .trainer-option');
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
      await expect(rows.first()).toContainText('Не верю');
      await expect(rows.first()).toHaveClass(/is-chosen/);
      await expect(rows.first()).toContainText('ваш выбор');
      await expect(rows.first()).toContainText('проверка сработает:');
      await expect(page.locator('#tFb .trainer-option.is-chosen')).toHaveCount(1);
      await expect(page.locator('#tFb')).toContainText('Варианты по шансу');
    });

    test('после «Ставлю» варианты тоже показаны, проверка не отмечена', async ({ page }) => {
      await open(page, 'train');
      await page.click('#tRaise');   // поля по умолчанию всегда содержат допустимую ставку
      const rows = page.locator('#tFb .trainer-option');
      expect(await rows.count()).toBeGreaterThanOrEqual(1);
      await expect(rows.first()).toContainText('Не верю');
      await expect(rows.first()).not.toHaveClass(/is-chosen/);
    });

    test('варианты помещаются: разбор и «Новая ситуация» остаются в пределах экрана', async ({ page }) => {
      await open(page, 'train');
      await page.click('#tDudo');
      const vh = page.viewportSize().height;
      const b = await page.locator('#tFb').boundingBox();
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(vh + 1);
      const hs = await page.locator('#tFb').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(hs, 'в разборе нет горизонтальной прокрутки').toBe(true);
    });

    test('степпер и выбор цифры меняют ставку «Ставлю»', async ({ page }) => {
      await open(page, 'train');
      await expect(page.locator('#tPick .face-btn[aria-checked="true"]')).toHaveCount(1);
      await page.click('#tPick .face-btn[aria-label="Цифра 4"]');
      await expect(page.locator('#tF')).toHaveValue('4');
      const q = Number(await page.inputValue('#tQ'));
      await page.click('#tPlus');
      await expect(page.locator('#tQ')).toHaveValue(String(q + 1));
      await page.click('#tMinus');
      await page.click('#tMinus');
      await expect(page.locator('#tQ')).toHaveValue(String(Math.max(1, q - 1)));
    });

    test('ставка «Ставлю» принимается и оценивается', async ({ page }) => {
      await open(page, 'train');
      await page.click('#tRaise');
      await expect(page.locator('#tFb')).toContainText('Ваша ставка');
    });

    test('недопустимая ставка отклоняется и не попадает в статистику', async ({ page }) => {
      await open(page, 'train');
      const before = await page.locator('#tStat').textContent();
      // 1×2 после любой чужой ставки недопустимо
      await page.fill('#tQ', '1');
      await page.click('#tPick .face-btn[aria-label="Цифра 2"]');
      await page.click('#tRaise');
      await expect(page.locator('#tFb')).toContainText(/не меньше|нельзя/);
      await expect(page.locator('#tFb')).not.toContainText('Хорошее решение');
      await expect(page.locator('#tLayout')).not.toHaveClass(/is-answered/);
      expect(await page.locator('#tStat').textContent()).toBe(before);
    });

    test('смена режима даёт новую ситуацию и обновляет подпись', async ({ page }) => {
      await open(page, 'train');
      await page.click('.trainer-settings-more summary');
      await page.locator('#tModePick [data-mode="endgame"]').click();
      await expect(page.locator('#tMode')).toHaveValue('endgame');
      await expect(page.locator('#tSettingsHint')).toContainText('Эндшпиль');
      await expect(page.locator('#tModePick [data-mode="endgame"]')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#tModePick [aria-checked="true"]')).toHaveCount(1);
      await expect(page.locator('#tDesc')).toContainText('3–6 кубиков');
    });

    test('порог меняется степпером на 0.05 в пределах 0.05–0.95, подпись обновляется', async ({ page }) => {
      await open(page, 'train');
      await page.click('.trainer-settings-more summary');
      await page.locator('#tTPlus').click();
      await expect(page.locator('#tT')).toHaveValue('0.55');
      await expect(page.locator('#tSettingsHint')).toContainText('порог 0.55');
      await page.locator('#tTMinus').click();
      await page.locator('#tTMinus').click();
      await expect(page.locator('#tT')).toHaveValue('0.45');
      await page.fill('#tT', '0.95');
      await page.locator('#tTPlus').click();
      await expect(page.locator('#tT')).toHaveValue('0.95');
    });

    test('«Сбросить статистику»: без подтверждения ничего не стирается, с подтверждением счётчики обнуляются', async ({ page }) => {
      await open(page, 'train');
      await page.locator('#tDudo').click();
      await expect(page.locator('#tStat')).toContainText('Всего: 1');
      await page.click('.trainer-settings-more summary');
      page.once('dialog', (d) => d.dismiss());
      await page.locator('#tReset').click();
      await expect(page.locator('#tStat')).toContainText('Всего: 1');
      page.once('dialog', (d) => d.accept());
      await page.locator('#tReset').click();
      await expect(page.locator('#tStat')).toContainText('Всего: 0');
    });
  });

  test.describe('Упражнения', () => {
    test('«Оценка в уме»: проверка даёт разбор и раскрывает подсказку', async ({ page }) => {
      await open(page, 'drill');
      await page.fill('#dA1', '5');
      await page.fill('#dA2', '5');
      await page.click('#dACheck');
      await expect(page.locator('#dAfb')).toContainText('Ожидание');
      await expect(page.locator('#dAfb')).toContainText('Безопасная ставка');

      await page.locator('#dAfb .calc-hint summary').click();
      await expect(page.locator('#dAfb .calc-hint-body')).toBeVisible();
    });

    test.describe('учёт попыток', () => {
      const drillStat = (page, k) => page.evaluate((key) =>
        (JSON.parse(localStorage.getItem('perudo.userProfile') || 'null')?.drill || {})[key] || { n: 0, good: 0 }, k);

      test('A: пустой или неполный ответ не засчитывается, показано сообщение', async ({ page }) => {
        await open(page, 'drill');
        await page.click('#dACheck');
        await expect(page.locator('#dAfb')).toContainText('Введите оба ответа');
        await page.fill('#dA1', '5');
        await page.click('#dACheck');
        await expect(page.locator('#dAfb')).toContainText('Введите оба ответа');
        await page.fill('#dA2', '5.5');
        await page.click('#dACheck');
        await expect(page.locator('#dAfb')).toContainText('целое');
        expect((await drillStat(page, 'A')).n).toBe(0);
        await expect(page.locator('#dACheck')).toBeEnabled();
      });

      test('A: повторная проверка одной задачи не накручивает счётчик; после «Новое» снова пишется', async ({ page }) => {
        await open(page, 'drill');
        await page.fill('#dA1', '5');
        await page.fill('#dA2', '5');
        await page.click('#dACheck');
        await expect(page.locator('#dACheck')).toBeDisabled();
        await page.locator('#dACheck').dispatchEvent('click');
        expect((await drillStat(page, 'A')).n).toBe(1);
        await page.click('#dNew');
        await expect(page.locator('#dACheck')).toBeEnabled();
        await page.fill('#dA1', '5');
        await page.fill('#dA2', '5');
        await page.click('#dACheck');
        expect((await drillStat(page, 'A')).n).toBe(2);
      });

      // Задача n=8, у вас 2,3,4,5,6 (без единиц), цифра 1: безопасной ставки нет
      const forceNoSafeTask = (page) => page.evaluate(() => {
        const seq = [0, 0.99, 0.2, 0.4, 0.5, 0.7, 0.9, 0];
        const real = Math.random;
        Math.random = () => { if (seq.length) return seq.shift(); Math.random = real; return real(); };
      });

      test('A: безопасной ставки нет — понятный текст без «0.0% ✔» и без формулы', async ({ page }) => {
        await open(page, 'drill');
        await forceNoSafeTask(page);
        await page.click('#dNew');
        await page.fill('#dA1', '0.5');
        await page.fill('#dA2', '0');
        await page.click('#dACheck');
        const fb = page.locator('#dAfb');
        await expect(fb).toContainText('Безопасной ставки нет');
        await expect(fb).toContainText('Правильный ответ — 0');
        await page.locator('#dAfb .calc-hint summary').click();
        await expect(fb).not.toContainText('✔');
        await expect(fb).not.toContainText('Для любознательных');
        await expect(fb).not.toContainText('0.0%');
      });

      test('A: ответ выше безопасного — пометка о шансе', async ({ page }) => {
        await open(page, 'drill');
        await page.fill('#dA1', '5');
        await page.fill('#dA2', '100');
        await page.click('#dACheck');
        await expect(page.locator('#dAfb')).toContainText(/не принята: шанс|Безопасной ставки нет/);
      });

      test('B: пустое и дробное не засчитываются, повторные нажатия дают одну запись', async ({ page }) => {
        await open(page, 'drill');
        await page.click('.drill-tab[data-drill="B"]');
        await page.click('#dBCheck');
        await expect(page.locator('#dBfb')).toContainText('Введите число');
        await page.fill('#dB1', '5.7');
        await page.click('#dBCheck');
        await expect(page.locator('#dBfb')).toContainText('целое');
        expect((await drillStat(page, 'B')).n).toBe(0);
        await page.fill('#dB1', '5');
        await page.click('#dBCheck');
        await page.locator('#dBCheck').dispatchEvent('click');
        await page.locator('#dBCheck').dispatchEvent('click');
        expect((await drillStat(page, 'B')).n).toBe(1);
        await expect(page.locator('#dBCheck')).toBeDisabled();
        await page.click('#dNew');
        await expect(page.locator('#dBCheck')).toBeEnabled();
      });
    });

    test('«Оценка в уме»: свёрнутая памятка «Как прикинуть в уме» с правилом и примером', async ({ page }) => {
      await open(page, 'drill');
      const memo = page.locator('#dPanelA .drill-hint');
      await expect(memo.locator('summary')).toHaveText('Как прикинуть в уме');
      await expect(memo.locator('.drill-hint-body')).toBeHidden();             // по умолчанию свёрнута
      await memo.locator('summary').click();
      const body = memo.locator('.drill-hint-body');
      await expect(body).toBeVisible();
      await expect(body).toContainText('свои + чужие × шанс');
      await expect(body).toContainText('1/3');
      await expect(body).toContainText('1/6');
      await expect(body).toContainText('ближайшего целого');
      await expect(body).toContainText('ровно посередине');
      await expect(body).toContainText('6,3 → 6');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('«Оценка в уме»: разбор после ответа — шаги с числами задачи и округление по правилу', async ({ page }) => {
      await open(page, 'drill');
      await page.fill('#dA1', '5');
      await page.fill('#dA2', '5');
      await page.click('#dACheck');
      await page.locator('#dAfb .calc-hint summary').click();
      const body = page.locator('#dAfb .calc-hint-body');
      await expect(body).toContainText('1. Ожидание');
      await expect(body).toContainText('Ваши подходящие кубики');
      await expect(body).toContainText('Шанс одного чужого');
      await expect(body).toContainText('Округляем к ближайшему целому');
      await expect(body).toContainText('Проверка точным расчётом');
      await expect(body).not.toContainText('E[X]');                             // обозначений из учебника в разборе нет
      await expect(body).not.toContainText('на 1–2 меньше');
    });

    test('панель проверки видна на экране, кнопки следуют за выбранным упражнением', async ({ page }) => {
      await open(page, 'drill');
      const vh = page.viewportSize().height;
      for (const sel of ['#dACheck', '#dNew']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.y + b.height, `${sel} в пределах экрана`).toBeLessThanOrEqual(vh + 1);
      }
      await expect(page.locator('#dBCheck')).toBeHidden();
      await page.click('.drill-tab[data-drill="B"]');
      await expect(page.locator('#dACheck')).toBeHidden();
      await expect(page.locator('#dBCheck')).toBeVisible();
    });

    test('после проверки разбор виден на экране, подробный разбор прокручивается внутри панели', async ({ page }) => {
      await open(page, 'drill');
      await page.fill('#dA1', '5');
      await page.fill('#dA2', '5');
      await page.click('#dACheck');
      const vh = page.viewportSize().height;
      const fb = await page.locator('#dAfb').boundingBox();
      expect(fb.y).toBeGreaterThanOrEqual(0);
      expect(fb.y + fb.height).toBeLessThanOrEqual(vh + 1);
      const before = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.locator('#dAfb .calc-hint summary').click();
      const after = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(after - before, 'раскрытие разбора растягивает страницу не больше чем на 15% экрана').toBeLessThanOrEqual(vh * 0.15);
    });

    test('«Правило единиц»: переключение, проверка и новый вопрос', async ({ page }) => {
      await open(page, 'drill');
      await page.click('.drill-tab[data-drill="B"]');
      await expect(page.locator('#dPanelB')).toBeVisible();
      await expect(page.locator('#dPanelA')).toBeHidden();

      await page.fill('#dB1', '5');
      await page.click('#dBCheck');
      await expect(page.locator('#dBfb')).not.toBeEmpty();

      await page.click('#dNew');
      await expect(page.locator('#dBfb')).toBeEmpty();
      await expect(page.locator('#dB1')).toHaveValue('');
    });
  });

  test.describe('Дуэль', () => {
    test('«Играть» считает равновесие и ведёт раунд до результата', async ({ page }) => {
      await open(page, 'duel');
      const vh = page.viewportSize().height;
      const startBox = await page.locator('#dStart').boundingBox();
      expect(startBox.y + startBox.height, 'кнопка «Играть» на экране').toBeLessThanOrEqual(vh + 1);
      await page.click('#dStart');
      await expect(page.locator('#dPlay [data-i]').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('#dOpen table')).toBeVisible();
      // ходим первой доступной ставкой, пока раунд не закончится «Не верю!»
      for (let i = 0; i < 12; i++) {
        const done = await page.locator('#dPlay').innerText();
        if (/выиграли раунд|проиграли раунд/.test(done)) break;
        const moves = page.locator('#dPlay [data-i]');
        await moves.nth((await moves.count()) - 1).click();   // последняя кнопка — «Не верю!» или самая высокая ставка
      }
      await expect(page.locator('#dPlay')).toContainText('раунд');
      await expect(page.locator('#dPlay')).toContainText('Сессия: партий 1');
    });

    test('таблица равновесия не растягивает страницу вбок', async ({ page }) => {
      await open(page, 'duel');
      await page.click('#dSolve');
      await expect(page.locator('#dOpen table')).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });

  test.describe('Статистика', () => {
    const seedGames = (page) => page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem('perudo.games', JSON.stringify(Array.from({ length: 15 }, (_, i) =>
        ({ ts: now - i * 3600000, players: 4, rounds: 12 + i, won: i % 2 === 0, decisions: 30 + i }))));
    });

    test('«Статистика» — последняя вкладка в ленте разделов', async ({ page }) => {
      const names = await page.locator('#mainNav .tab-btn').evaluateAll((b) => b.map((x) => x.dataset.t));
      expect(names.at(-1)).toBe('stats');
      expect(names).toEqual(['calc', 'train', 'drill', 'game', 'duel', 'sim', 'stats']);
    });

    test('таблица партий помещается в карточку, кнопки доступны', async ({ page }) => {
      await seedGames(page);
      await open(page, 'stats');
      await expect(page.locator('#stGames .game-list')).toBeVisible();
      expect(await page.locator('#stGames').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await openStatsTab(page, 'data');
      for (const sel of ['#stExport', '#stClear']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe('Симуляция', () => {
    test('запуск Монте-Карло показывает таблицу рядом с формулой, кнопка всегда на экране', async ({ page }) => {
      await open(page, 'sim');
      const vh = page.viewportSize().height;
      let b = await page.locator('#sGo').boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(vh + 1);
      await page.fill('#sR', '2000');
      await page.click('#sGo');
      await expect(page.locator('#sOut table')).toBeVisible();
      await expect(page.locator('#sOut th').nth(2)).toHaveText('Формула');
      b = await page.locator('#sGo').boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(vh + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });

  test.describe('Резервная копия', () => {
    const KEYS = {
      stats: 'perudo.userProfile', games: 'perudo.games', settings: 'perudo.settings',
      memory: 'perudo.botMemory', duel: 'perudo.duelStats',
    };
    const seed = (page) => page.evaluate((K) => {
      localStorage.setItem(K.stats, JSON.stringify({ n: 5, good: 4, totalGames: 0, totalWins: 0, totalDecisions: 0, goodDecisions: 0, byMode: { classic: { n: 5, good: 4 } }, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
      localStorage.setItem(K.games, JSON.stringify([{ ts: 1700000000000, players: 4, startDice: 5, rounds: 8, won: true, decisions: 20, calza: false, palifico: false }]));
      localStorage.setItem(K.settings, JSON.stringify({ assistMode: 'game', botSpeed: 'fast' }));
      localStorage.setItem(K.duel, JSON.stringify({ games: 2, wins: 1, moves: 4, dev: 0 }));
    }, KEYS);
    const dump = (page) => page.evaluate((K) => Object.fromEntries(
      Object.entries(K).map(([n, k]) => [n, JSON.parse(localStorage.getItem(k) || 'null')])), KEYS);

    test('экспорт содержит настройки и все данные в формате perudo-backup', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stExport')]);
      expect(download.suggestedFilename()).toMatch(/^perudo-backup-\d{4}-\d{2}-\d{2}\.json$/);
      const text = readFileSync(await download.path(), 'utf8');
      const b = JSON.parse(text);
      expect(b.format).toBe('perudo-backup');
      expect(b.version).toBe(2);
      expect(b.data[KEYS.settings]).toEqual({ assistMode: 'game', botSpeed: 'fast' });
      expect(b.data[KEYS.stats].n).toBe(5);
      expect(b.data[KEYS.duel].games).toBe(2);
    });

    test('импорт возвращает данные после «Сбросить всё»', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stExport')]);
      const file = await download.path();
      const before = await dump(page);

      page.once('dialog', (d) => d.accept());
      await page.click('#stClear');
      expect((await dump(page)).stats.n).toBe(0);

      page.once('dialog', (d) => d.accept());
      await page.setInputFiles('#stImportFile', file);
      await page.waitForFunction(() => document.querySelector('#stBackupMsg')?.textContent.includes('восстановлены'));
      const after = await dump(page);
      expect(after.stats).toEqual(before.stats);
      expect(after.games).toEqual(before.games);
      expect(after.settings).toEqual(before.settings);
      expect(after.duel).toEqual(before.duel);
      await expect(page.locator('#stats')).toBeVisible();
    });

    test('«Сбросить всё» стирает и сохранённые раунды', async ({ page }) => {
      await seed(page);
      await page.evaluate(() => localStorage.setItem('perudo.rounds', JSON.stringify([{
        id: 'g-r1', ts: 1, round: 1, wild: true, me: 0, dice: [1, 1], styles: [null, 'smart'],
        hands: [[2], [3]], bids: [{ s: 0, q: 1, f: 2 }], end: { kind: 'dudo', by: 1, bidder: 0, actual: 1, ok: true },
      }])));
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      page.once('dialog', (d) => d.accept());
      await page.click('#stClear');
      expect(await page.evaluate(() => localStorage.getItem('perudo.rounds'))).toBeNull();
    });

    test('отмена в окне подтверждения ничего не меняет', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stExport')]);
      const file = await download.path();
      await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ n: 99, good: 1, byMode: {}, drill: {} })), KEYS.stats);
      page.once('dialog', (d) => d.dismiss());
      await page.setInputFiles('#stImportFile', file);
      await expect(page.locator('#stBackupMsg')).toHaveText('Импорт отменён.');
      expect((await dump(page)).stats.n).toBe(99);
    });

    test('чужой файл отклоняется с понятным сообщением, данные целы', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      await page.setInputFiles('#stImportFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
      await expect(page.locator('#stBackupMsg')).toContainText('не копия данных Перудо');
      await page.setInputFiles('#stImportFile', { name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('не json') });
      await expect(page.locator('#stBackupMsg')).toContainText('не JSON');
      expect((await dump(page)).stats.n).toBe(5);
    });

    test('файл с повреждёнными записями: сообщается число пропущенных, годное восстанавливается', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const file = {
        format: 'perudo-backup', version: 2, exportedAt: 1700000000000,
        data: {
          'perudo.userProfile': { n: 7, good: 3, byMode: { classic: { n: 7, good: 3 }, junk: 'x' } },
          'perudo.games': [
            { ts: 1700000000000, players: 4, rounds: 8, won: true, decisions: 20 },
            { ts: 'вчера' }, 42,
          ],
        },
      };
      let confirmText = '';
      page.once('dialog', (d) => { confirmText = d.message(); d.accept(); });
      await page.setInputFiles('#stImportFile', { name: 'half.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
      await page.waitForFunction(() => document.querySelector('#stBackupMsg')?.textContent.includes('восстановлены'));
      expect(confirmText).toContain('повреждённые записи (3)');
      await expect(page.locator('#stBackupMsg')).toContainText('Пропущено повреждённых записей: 3');
      const after = await dump(page);
      expect(after.stats.n).toBe(7);
      expect(Object.keys(after.stats.byMode)).toEqual(['classic']);
      expect(after.games).toHaveLength(1);
    });

    test('игрок (имя и аватар) входит в копию, возвращается при импорте и стирается «Сбросить всё»', async ({ page }) => {
      const player = { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } };
      await seed(page);
      await page.evaluate((v) => localStorage.setItem('perudo.player', JSON.stringify(v)), player);
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stExport')]);
      const file = await download.path();
      expect(JSON.parse(readFileSync(file, 'utf8')).data['perudo.player']).toEqual(player);

      page.once('dialog', (d) => d.accept());
      await page.click('#stClear');
      expect(await page.evaluate(() => localStorage.getItem('perudo.player'))).toBeNull();

      page.once('dialog', (d) => d.accept());
      await page.setInputFiles('#stImportFile', file);
      await page.waitForFunction(() => document.querySelector('#stBackupMsg')?.textContent.includes('восстановлены'));
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.player')))).toEqual(player);
    });

    test('старая копия (версия 1) читается', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'data');
      const old = { schemaVersion: 1, exportedAt: 1700000000000, stats: { n: 7, good: 6, byMode: {}, drill: {} }, queue: [], games: [], duel: { games: 1, wins: 1, moves: 2, dev: 0 } };
      page.once('dialog', (d) => d.accept());
      await page.setInputFiles('#stImportFile', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
      await page.waitForFunction(() => document.querySelector('#stBackupMsg')?.textContent.includes('восстановлены'));
      expect((await dump(page)).stats.n).toBe(7);
    });
  });

  test.describe('Слабые места в «Статистике»', () => {
    const seedTags = (page, byTag) => page.evaluate((bt) => {
      localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 0, good: 0, byMode: {}, byTag: bt,
        drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
    }, byTag);

    test('пустой профиль: подсказка, кнопок нет', async ({ page }) => {
      await open(page, 'stats');
      await expect(page.locator('#stWeak')).toContainText('Над чем поработать');
      await expect(page.locator('#stWeak')).toContainText('после нескольких партий');
      await expect(page.locator('#stWeak .weak-train')).toHaveCount(0);
    });

    test('слабые темы с числом решений; кнопка только у тем с режимом; мало данных помечено', async ({ page }) => {
      await seedTags(page, {
        endgame: { n: 10, good: 3 }, dudo: { n: 12, good: 6 }, lastDie: { n: 4, good: 0 },
      });
      await page.reload();
      await open(page, 'stats');
      const items = page.locator('#stWeak .weak-item');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText('Эндшпиль');
      await expect(items.nth(0)).toContainText('10 реш.');
      await expect(items.nth(0).locator('.weak-train')).toBeVisible();
      await expect(items.nth(1)).toContainText('Проверки ставок');
      await expect(items.nth(1).locator('.weak-train')).toHaveCount(0);
      await expect(page.locator('#stWeak .weak-pending')).toContainText('игра на последнем кубике (4)');
    });

    test('«Тренировать» открывает тренажёр в нужном режиме', async ({ page }) => {
      await seedTags(page, { palifico: { n: 9, good: 2 } });
      await page.reload();
      await open(page, 'stats');
      await page.locator('#stWeak .weak-train').click();
      await expect(page.locator('#tMode')).toHaveValue('nowild');
      await expect(page.locator('#tDudo')).toBeVisible();
    });

    test('«Сбросить всё» очищает блок', async ({ page }) => {
      await seedTags(page, { endgame: { n: 10, good: 3 } });
      await page.reload();
      await open(page, 'stats');
      await expect(page.locator('#stWeak .weak-item')).toHaveCount(1);
      await openStatsTab(page, 'data');
      page.once('dialog', (d) => d.accept());
      await page.locator('#stClear').click();
      await openStatsTab(page, 'results');
      await expect(page.locator('#stWeak .weak-item')).toHaveCount(0);
    });
  });

  test.describe('Пауза между повторами в «Тренажёре»', () => {
    const repeatVisible = (page) => page.locator('#tInfo .trainer-repeat').isVisible();
    // Случайные числа выключены: повтор берётся всякий раз, когда он разрешён.
    const noRandom = (page) => page.addInitScript(() => { Math.random = () => 0; });

    test('ошибка в новой ситуации возвращается не раньше чем через три другие', async ({ page }) => {
      await noRandom(page);
      await page.reload();
      await open(page, 'train');
      expect(await repeatVisible(page)).toBe(false);
      await page.evaluate(() => { document.querySelector('#tT').value = '0'; });   // порог 0: «Не верю» всегда считается ошибкой
      await page.locator('#tDudo').click();
      await expect(page.locator('#tFb')).toContainText('Сомнительное решение');
      for (let i = 1; i <= 3; i++) {
        // после ответа есть только «Новая ситуация» в разборе; дальше доступна обычная кнопка
        await page.locator(i === 1 ? '#tNext' : '#tNew').click();
        expect(await repeatVisible(page), `ситуация ${i} после ошибки`).toBe(false);
      }
      await page.locator('#tNew').click();
      expect(await repeatVisible(page)).toBe(true);
    });

    test('после показа повтора следующий — не раньше чем через три новые', async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('perudo.trainingQueue', JSON.stringify([
        { mode: 'classic', n: 14, h: [2, 3, 4, 5, 6], f: 5, q: 7, streak: 0 }])));
      await noRandom(page);
      await page.reload();
      await open(page, 'train');
      expect(await repeatVisible(page), 'первая ситуация — повтор').toBe(true);
      for (let i = 1; i <= 3; i++) {
        await page.locator('#tNew').click();
        expect(await repeatVisible(page), `новая ${i}`).toBe(false);
      }
      await page.locator('#tNew').click();
      expect(await repeatVisible(page)).toBe(true);
    });
  });

  test.describe('Профиль игрока в «Статистике»', () => {
    const readPlayer = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('perudo.player') || 'null'));

    test('по умолчанию имя не задано, аватар стандартный, «Убрать аватар» недоступна', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await expect(page.locator('#plName')).toHaveValue('');
      await expect(page.locator('#plName')).toHaveAttribute('placeholder', 'Вы');
      await expect(page.locator('#plEmojis [aria-checked="true"]')).toHaveCount(0);
      await expect(page.locator('#plAvatar svg')).toHaveCount(1);
      await expect(page.locator('#plClear')).toBeDisabled();
      expect(await readPlayer(page)).toBeNull();
    });

    test('имя сохраняется при вводе и после перезагрузки; лишнее обрезается', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await page.locator('#plName').fill('  Анна   Иванова  ');
      expect((await readPlayer(page)).name).toBe('Анна Иванова');
      await page.locator('#plName').fill('я'.repeat(40));
      expect((await readPlayer(page)).name).toBe('я'.repeat(20));       // maxlength поля
      await page.locator('#plName').fill('Анна');
      await page.reload();
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await expect(page.locator('#plName')).toHaveValue('Анна');
    });

    test('эмодзи-аватар выбирается, подсвечивается и убирается', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await openAvatarPicker(page);
      await page.locator('#plEmojis [data-emoji="🦊"]').click();
      await expect(page.locator('#plEmojis [data-emoji="🦊"]')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#plAvatar .seat-emoji')).toHaveText('🦊');
      expect((await readPlayer(page)).avatar).toEqual({ type: 'emoji', value: '🦊' });
      await page.locator('#plEmojis [data-emoji="🐼"]').click();
      await expect(page.locator('#plEmojis [aria-checked="true"]')).toHaveCount(1);
      await page.locator('#plClear').click();
      expect((await readPlayer(page)).avatar).toBeNull();
      await expect(page.locator('#plAvatar svg')).toHaveCount(1);
      await expect(page.locator('#plClear')).toBeDisabled();
    });

    test('выбор аватара свёрнут: видны имя и текущий аватар, сетка раскрывается и сворачивается', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      const toggle = page.locator('#plToggle');
      await expect(toggle).toHaveText('Изменить аватар');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#plPicker')).toBeHidden();
      await expect(page.locator('#plAvatar')).toBeVisible();
      await toggle.click();
      await expect(page.locator('#plPicker')).toBeVisible();
      await expect(page.locator('#plEmojis .player-emoji')).toHaveCount(16);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveText('Скрыть выбор аватара');
      await toggle.click();
      await expect(page.locator('#plPicker')).toBeHidden();
    });

    test('фото сжимается до небольшого JPEG и показывается; не-картинка отклоняется', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await page.setInputFiles('#plFile', 'apple-touch-icon.png');
      await expect(page.locator('#plMsg')).toContainText('Фото сохранено');
      const a = (await readPlayer(page)).avatar;
      expect(a.type).toBe('photo');
      expect(a.value).toMatch(/^data:image\/jpeg;base64,/);
      expect(a.value.length).toBeLessThanOrEqual(12000);
      await expect(page.locator('#plAvatar img.seat-photo')).toBeVisible();

      await page.setInputFiles('#plFile', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('привет') });
      await expect(page.locator('#plMsg')).toContainText('Это не картинка');
      expect((await readPlayer(page)).avatar).toEqual(a);               // прежний аватар цел
      await page.setInputFiles('#plFile', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('не картинка') });
      await expect(page.locator('#plMsg')).toContainText('Не удалось прочитать');
      expect((await readPlayer(page)).avatar).toEqual(a);
    });

    test('«Сбросить всё» очищает профиль и поля', async ({ page }) => {
      await open(page, 'stats');
      await openStatsTab(page, 'player');
      await page.locator('#plName').fill('Анна');
      await openAvatarPicker(page);
      await page.locator('#plEmojis [data-emoji="🦊"]').click();
      await openStatsTab(page, 'data');
      page.once('dialog', (d) => { expect(d.message()).toContain('профиль игрока'); d.accept(); });
      await page.locator('#stClear').click();
      await openStatsTab(page, 'player');
      await expect(page.locator('#plName')).toHaveValue('');
      await expect(page.locator('#plEmojis [aria-checked="true"]')).toHaveCount(0);
      expect(await readPlayer(page)).toBeNull();
    });
  });
});
