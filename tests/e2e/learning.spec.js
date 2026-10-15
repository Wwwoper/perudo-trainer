// tests/e2e/learning.spec.js
// Дымовые сценарии учебных вкладок: Калькулятор, Тренажёр, Упражнения.
// Страхуют переделку вёрстки: после неё вкладки должны делать то же самое.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openTab } from './helpers.js';

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
      // заведомо большая ставка: количество не больше общего числа кубиков, но выше ставки соперника
      const total = await page.evaluate(() => {
        const n = [...document.querySelectorAll('#tInfo .trainer-chip b')][0];
        return Number(n?.textContent);
      });
      await page.fill('#tQ', String(total));
      await page.click('#tPick .face-btn[aria-label="Цифра 6"]');
      await page.click('#tRaise');
      await expect(page.locator('#tFb')).toContainText('Ваша ставка');
    });

    test('смена режима даёт новую ситуацию и обновляет подпись', async ({ page }) => {
      await open(page, 'train');
      await page.click('.trainer-settings-more summary');
      await page.selectOption('#tMode', 'endgame');
      await expect(page.locator('#tSettingsHint')).toContainText('Эндшпиль');
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
      await expect(page.locator('#stGames table')).toBeVisible();
      expect(await page.locator('#stGames').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
      localStorage.setItem(K.stats, JSON.stringify({ n: 5, good: 4, byMode: { classic: { n: 5, good: 4 } }, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
      localStorage.setItem(K.games, JSON.stringify([{ ts: 1700000000000, players: 4, rounds: 8, won: true, decisions: 20 }]));
      localStorage.setItem(K.settings, JSON.stringify({ assistMode: 'game', botSpeed: 'fast' }));
      localStorage.setItem(K.duel, JSON.stringify({ games: 2, wins: 1, moves: 4, dev: 0 }));
    }, KEYS);
    const dump = (page) => page.evaluate((K) => Object.fromEntries(
      Object.entries(K).map(([n, k]) => [n, JSON.parse(localStorage.getItem(k) || 'null')])), KEYS);

    test('экспорт содержит настройки и все данные в формате perudo-backup', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
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

    test('отмена в окне подтверждения ничего не меняет', async ({ page }) => {
      await seed(page);
      await page.reload();
      await open(page, 'stats');
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
      await page.setInputFiles('#stImportFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
      await expect(page.locator('#stBackupMsg')).toContainText('не копия данных Перудо');
      await page.setInputFiles('#stImportFile', { name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('не json') });
      await expect(page.locator('#stBackupMsg')).toContainText('не JSON');
      expect((await dump(page)).stats.n).toBe(5);
    });

    test('старая копия (версия 1) читается', async ({ page }) => {
      await open(page, 'stats');
      const old = { schemaVersion: 1, exportedAt: 1700000000000, stats: { n: 7, good: 6, byMode: {}, drill: {} }, queue: [], games: [], duel: { games: 1, wins: 1, moves: 2, dev: 0 } };
      page.once('dialog', (d) => d.accept());
      await page.setInputFiles('#stImportFile', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
      await page.waitForFunction(() => document.querySelector('#stBackupMsg')?.textContent.includes('восстановлены'));
      expect((await dump(page)).stats.n).toBe(7);
    });
  });
});
