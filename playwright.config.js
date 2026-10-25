// Конфигурация e2e-тестов (Playwright Test). Запуск: npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,   // на GitHub один повтор: медленные раннеры иногда теряют клик; локально повторов нет
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node tests/e2e/static-server.mjs 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
