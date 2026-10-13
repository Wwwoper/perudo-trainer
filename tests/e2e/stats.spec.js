// tests/e2e/stats.spec.js
// Статистика тренажёра и упражнений хранится в одном объекте (perudo.userProfile).
// Ответ в одном разделе не должен стирать счётчики другого.
import { test, expect } from '@playwright/test';

const profile = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('perudo.userProfile') || 'null'));

async function openTab(page, name) {
  await page.click(`.tab-btn[data-t="${name}"]`);
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
    await page.click('#tNew');
    await page.click('#tDudo');
    await answerDrill(page);   // «Проверить» повторно: новый вопрос не нужен, ответ считается

    const p = await profile(page);
    expect(p.n).toBe(2);
    expect(p.drill.A.n).toBe(2);
  });
});
