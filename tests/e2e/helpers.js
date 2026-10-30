// tests/e2e/helpers.js
import { expect } from '@playwright/test';
// Общие помощники e2e: на телефоне лента разделов спрятана за кнопкой ☰ (партия и учебные вкладки).
export async function openTab(page, name) {
  const btn = page.locator(`.tab-btn[data-t="${name}"]`);
  const menu = page.locator('.hud-menu:visible');
  // Страница могла только что перерисоваться (вход, перезагрузка): ждём, пока появится кнопка раздела или кнопка ☰.
  await expect.poll(async () => (await btn.isVisible()) || (await menu.count()) > 0).toBe(true);
  if (!(await btn.isVisible())) {
    await menu.click();
  }
  await btn.click();
}

/** Раскрывает выбор аватара во вкладке «Игрок» (по умолчанию он свёрнут). */
export async function openAvatarPicker(page) {
  if ((await page.locator('#plToggle').getAttribute('aria-expanded')) !== 'true') await page.locator('#plToggle').click();
}

/** Подвкладка «Статистики»: 'results' | 'player' | 'data' (раздел «Статистика» уже открыт). */
export async function openStatsTab(page, name) {
  await page.locator(`#stTabs [data-st="${name}"]`).click();
}
