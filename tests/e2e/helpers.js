// tests/e2e/helpers.js
// Общие помощники e2e: на телефоне лента разделов спрятана за кнопкой ☰ (партия и учебные вкладки).
export async function openTab(page, name) {
  const btn = page.locator(`.tab-btn[data-t="${name}"]`);
  if (!(await btn.isVisible())) {
    await page.locator('.hud-menu:visible').click();
  }
  await btn.click();
}

/** Подвкладка «Статистики»: 'results' | 'player' | 'data' (раздел «Статистика» уже открыт). */
export async function openStatsTab(page, name) {
  await page.locator(`#stTabs [data-st="${name}"]`).click();
}
