// tests/e2e/onboarding.spec.js
// Онбординг новичка: экран приветствия на чистом профиле (W4-03).
import { test, expect } from './fixtures.js';
import { openTab } from './helpers.js';

const device = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('perudo.device')); } catch { return null; } });

test.describe('Экран приветствия', () => {
  test.use({ seedGuest: false });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('чистый профиль: приветствие занимает весь экран, остальное приложение скрыто', async ({ page }) => {
    const w = page.locator('#welcome');
    await expect(w).toBeVisible();
    await expect(w).toContainText('Добро пожаловать в Перудо');
    await expect(w.locator('.welcome-step')).toHaveCount(3);
    await expect(w.locator('.welcome-start')).toBeVisible();
    await expect(w.locator('.welcome-links > *')).toHaveCount(2);   // правила и пропуск — равные текстовые ссылки
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('#calc')).toBeHidden();
    await expect(w.locator('a.welcome-rules')).toHaveAttribute('href', 'docs/guide/rules.html');
    await expect(page.locator('#clWelcome')).toBeHidden();      // окно «гость или Яндекс» поверх приветствия не открывается
    // контент не уезжает: приветствие не выше экрана на телефоне и целиком помещается по ширине
    const box = await w.locator('.welcome-card').boundingBox();
    const vw = page.viewportSize().width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  });

  test('«Я уже знаю правила»: приложение открывается как обычно и приветствие больше не появляется', async ({ page }) => {
    await page.locator('[data-welcome="skip"]').click();
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#calc')).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-welcome', /.*/);
    expect((await device(page)).onboarding).toMatchObject({ done: true, skipped: true });
    await page.reload();
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#calc')).toBeVisible();
  });

  test('«Начать первую партию»: партия стартует сразу с настройками первой партии, без экрана подготовки', async ({ page }) => {
    await page.locator('[data-welcome="start"]').click();
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#game')).not.toHaveClass(/is-prestart/);
    await expect(page.locator('#gSetup')).toBeHidden();
    const g = await page.evaluate(() => ({
      players: window.__perudo_v2.game.players.length,
      assist: window.__perudo_v2.game.assistMode,
      speed: window.__perudo_v2.game.botSpeed,
      calza: window.__perudo_v2.game.calzaEnabled,
      palifico: window.__perudo_v2.game.palificoEnabled,
      style: window.__perudo_v2.game.players[1].style,
    }));
    expect(g).toEqual({ players: 2, assist: 'novice', speed: 'slow', calza: false, palifico: false, style: 'careful' });
    expect((await device(page)).onboarding).toMatchObject({ step: 'game', done: false });
    // после перезагрузки приветствие не возвращается: игрок уже начал
    await page.reload();
    await expect(page.locator('#welcome')).toBeHidden();
  });

  test('есть данные в профиле — приветствия нет', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 3, good: 2, totalGames: 1 })));
    await page.reload();
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#calc')).toBeVisible();
  });

  test('приветствие, которое раньше скрыли карточкой «Скрыть», не возвращается', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('perudo.device', JSON.stringify({ firstRunHidden: true })));
    await page.reload();
    await expect(page.locator('#welcome')).toBeHidden();
  });
});

const read = (page, key) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, key);

test.describe('Задачи онбординга в Тренажёре', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('perudo.device', JSON.stringify({
      account: 'guest', firstRunHidden: true, onboarding: { step: 'tasks', tasks: 0, done: false, skipped: false },
    })));
    await page.reload();
    await openTab(page, 'train');
  });

  test('блок «Первые задачи» с прогрессом; ответы не попадают в статистику и очередь повторов', async ({ page }) => {
    const box = page.locator('#obTasks');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Первые задачи');
    await expect(box).toContainText('не попадают в статистику и очередь повторов');
    await expect(box.locator('progress')).toHaveAttribute('max', '4');
    await expect(box.locator('progress')).toHaveJSProperty('value', 0);
    await expect(box).toContainText('Задач выполнено: 0 из 4');
    await page.evaluate(() => { document.querySelector('#tT').value = '0.05'; });   // при таком пороге «Не верю» почти всегда неверно: проверяем и промахи
    for (let i = 1; i <= 3; i++) {
      await page.locator('#tDudo').click();
      await expect(box).toContainText(`Задач выполнено: ${i} из 4`);
      await page.locator('#tNext').click();
    }
    expect((await read(page, 'perudo.trainingQueue')) ?? []).toEqual([]);          // промахи в очередь повторов не попали
    expect((await read(page, 'perudo.userProfile'))?.n ?? 0).toBe(0);
    await page.locator('#tDudo').click();
    await expect(box).toContainText('Первое знакомство закончено');
    await expect(box.locator('progress')).toHaveJSProperty('value', 4);
    expect((await read(page, 'perudo.device')).onboarding).toMatchObject({ step: 'finish', tasks: 4, done: false });
    expect((await read(page, 'perudo.userProfile'))?.n ?? 0).toBe(0);
  });

  test('«Готово» убирает блок; дальше Тренажёр работает как обычно и считает статистику', async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await page.locator('#tDudo').click();
      if (i < 3) await page.locator('#tNext').click();
    }
    await expect(page.locator('#obTasks a.ob-rules')).toHaveAttribute('href', 'docs/guide/rules.html');
    await expect(page.locator('[data-ob="login"]')).toHaveCount(0);               // выбор уже сделан (гость): только «в приложение»
    await page.locator('[data-ob="app"]').click();
    await expect(page.locator('#obTasks')).toBeHidden();
    await expect(page.locator('#game')).toBeVisible();                            // основное приложение начинается с «Партии»
    expect((await read(page, 'perudo.device')).onboarding).toMatchObject({ done: true, skipped: false });
    await openTab(page, 'train');
    await page.locator('#tNext').click();
    await page.locator('#tDudo').click();
    expect((await read(page, 'perudo.userProfile')).n).toBe(1);             // обычный режим: решение учтено
    await page.reload();
    await expect(page.locator('#obTasks')).toBeHidden();
  });
});

test.describe('Итоговый экран онбординга: выбор «Яндекс или гость»', () => {
  test.use({ seedGuest: false });

  /** Игрок прошёл партию и четыре задачи, но ещё не выбирал, как хранить данные. */
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('perudo.userProfile', JSON.stringify({ n: 0, good: 0, totalGames: 1, totalWins: 0, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
      localStorage.setItem('perudo.device', JSON.stringify({ firstRunHidden: true, onboarding: { step: 'tasks', tasks: 3, done: false, skipped: false } }));
    });
    await page.reload();
  });

  test('окно «Как вы будете играть?» не перебивает сценарий: ни после партии, ни в задачах', async ({ page }) => {
    await expect(page.locator('#clWelcome')).toBeHidden();
    await openTab(page, 'train');
    await openTab(page, 'calc');
    await openTab(page, 'train');
    await expect(page.locator('#clWelcome')).toBeHidden();
  });

  test('после последней задачи выбор предлагается на итоговом экране, окно не открывается', async ({ page }) => {
    await openTab(page, 'train');
    await page.locator('#tDudo').click();
    const box = page.locator('#obTasks');
    await expect(box).toContainText('Первое знакомство закончено');
    await expect(box).toContainText('Перейти в приложение: где хранить данные?');
    await expect(box.locator('[data-ob="login"]')).toHaveText('Войти через Яндекс');
    await expect(box.locator('[data-ob="guest"]')).toHaveText('Играть как гость');
    await expect(box.locator('a.ob-rules')).toHaveAttribute('href', 'docs/guide/rules.html');
    await expect(page.locator('#clWelcome')).toBeHidden();
  });

  test('«Играть как гость»: выбор сохранён, сценарий закончен, открыта «Партия»', async ({ page }) => {
    await openTab(page, 'train');
    await page.locator('#tDudo').click();
    await page.locator('[data-ob="guest"]').click();
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#obTasks')).toBeHidden();
    const dev = await read(page, 'perudo.device');
    expect(dev.account).toBe('guest');
    expect(dev.onboarding).toMatchObject({ done: true, skipped: false });
    await expect(page.locator('#clWelcome')).toBeHidden();
  });

  test('«Войти через Яндекс»: сценарий закончен и начинается вход', async ({ page }) => {
    await page.route(/oauth\.yandex\./, (r) => r.fulfill({ status: 302, headers: { location: 'http://127.0.0.1:4173/index.html' } }));   // вход «не состоялся»: назад в приложение
    await openTab(page, 'train');
    await page.locator('#tDudo').click();
    const req = page.waitForRequest(/oauth\.yandex\./);
    await page.locator('[data-ob="login"]').click();
    await req;
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    expect((await read(page, 'perudo.device')).onboarding).toMatchObject({ done: true });
  });

  test('ушли с итогового экрана, не выбрав: окно выбора возвращается при смене раздела', async ({ page }) => {
    await openTab(page, 'train');
    await page.locator('#tDudo').click();
    await expect(page.locator('#clWelcome')).toBeHidden();
    await openTab(page, 'calc');
    await expect(page.locator('#clWelcome')).toBeVisible();
  });
});
