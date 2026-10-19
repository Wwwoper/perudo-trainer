// tests/e2e/fixtures.js
// Общая заготовка e2e. Окно «Как вы будете играть?» открывается новичку при первом запуске и закрывает
// страницу от кликов, поэтому в обычных тестах игрок «уже выбрал режим гостя». Тесты самого окна
// отключают это: test.use({ seedGuest: false }).
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  seedGuest: [true, { option: true }],
  page: async ({ page, seedGuest }, use) => {
    if (seedGuest) {
      await page.addInitScript(() => {
        const GUEST = '{"account":"guest"}';
        try {
          if (!localStorage.getItem('perudo.device')) localStorage.setItem('perudo.device', GUEST);
          // Тесты часто чистят хранилище: после очистки выбор «гость» возвращается
          const clear = Storage.prototype.clear;
          Storage.prototype.clear = function clearKeepingGuest() {
            clear.call(this);
            if (this === localStorage) this.setItem('perudo.device', GUEST);
          };
        } catch (e) { /* хранилище недоступно: окно просто откроется */ }
      });
    }
    await use(page);
  },
});
