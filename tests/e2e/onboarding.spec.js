// tests/e2e/onboarding.spec.js
// Онбординг новичка: экран приветствия на чистом профиле (W4-03).
import { test, expect } from './fixtures.js';

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
