// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,          // партии последовательные, не мешают друг другу
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Playwright сам поднимет сервер и погасит его после тестов
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});