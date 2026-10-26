// tests/e2e/sound.spec.js — звуки в партии. AudioContext подменён: считаем, какие звуки запрошены.
import { test, expect } from './fixtures.js';
import { openTab } from './helpers.js';

const STUB = `(() => {
  const log = { contexts: 0, freqs: [], resumed: 0 };
  window.__audio = log;
  class Ctx {
    constructor() { log.contexts++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    resume() { log.resumed++; return Promise.resolve(); }
    createGain() { const f = () => {}; return { gain: { setValueAtTime: f, linearRampToValueAtTime: f, exponentialRampToValueAtTime: f }, connect: f }; }
    createOscillator() {
      const o = { frequency: { setValueAtTime: (v) => log.freqs.push(v), linearRampToValueAtTime: () => {} }, connect() {}, start() {}, stop() {} };
      return o;
    }
  }
  window.AudioContext = Ctx;
})();`;

const FREQ = { turn: 660, bid: 900, bidBot: 700, dudo: 330, deal: 1200 };

const setup = async (page, { mode, speed = 'normal', bots = 2, stub = STUB } = {}) => {
  await page.addInitScript(stub);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__perudo_v2));
  if (mode) await page.evaluate((m) => window.__perudo_v2.setSoundMode(m), mode);
  await openTab(page, 'game');
  await page.locator('#gBots').fill(String(bots));
  await page.locator('#gSpeed').selectOption(speed);
  await page.locator('#gRevealOpt').setChecked(false);
};

const start = async (page) => {
  await page.locator('#gSetup .side-start').click();        // клик — жест игрока: звук разблокируется
  await expect(page.locator('#gameTable .seat').first()).toBeVisible();
};
const humanTurn = (page) => page.waitForFunction(() => {
  const g = window.__perudo_v2.game;
  return g && g.state === 'active' && g.currentPlayer === 0;
}, null, { timeout: 15_000 });
const freqs = (page) => page.evaluate(() => window.__audio.freqs.slice());

test.describe('Звуки', () => {
  test('по умолчанию выключены: контекст не создаётся, звуков нет', async ({ page }) => {
    await setup(page);
    await start(page);
    await humanTurn(page);
    await page.locator('#gRaise').click();
    await humanTurn(page);
    expect(await page.evaluate(() => window.__audio.contexts)).toBe(0);
    expect(await freqs(page)).toEqual([]);
  });

  test('режим «обычно»: «ваш ход» и ваша ставка звучат (быстрый темп: раздача молчит)', async ({ page }) => {
    await setup(page, { mode: 'normal', speed: 'fast' });
    await start(page);
    await humanTurn(page);
    expect(await page.evaluate(() => window.__audio.contexts)).toBe(1);
    await expect.poll(() => freqs(page)).toContain(FREQ.turn);
    await page.waitForTimeout(400);                          // звук «ваш ход» отзвучал: ваша ставка не пропускается как фоновая
    await page.locator('#gRaise').click();
    await expect.poll(() => freqs(page)).toContain(FREQ.bid);
  });

  test('быстрый темп: ставки ботов молчат, «ваш ход» слышен', async ({ page }) => {
    await setup(page, { mode: 'normal', speed: 'fast', bots: 3 });
    await start(page);
    await humanTurn(page);
    await page.locator('#gRaise').click();
    await humanTurn(page);                                   // боты сходили, снова ваша очередь
    const f = await freqs(page);
    expect(f).not.toContain(FREQ.bidBot);
    expect(f.filter((x) => x === FREQ.turn).length).toBeGreaterThanOrEqual(2);
  });

  test('обычный темп: раздача кубиков при старте звучит', async ({ page }) => {
    await setup(page, { mode: 'normal', speed: 'normal', bots: 2 });
    await start(page);
    await expect.poll(() => freqs(page)).toContain(FREQ.deal);
  });

  test('обычный темп: ставки ботов слышны', async ({ page }) => {
    await setup(page, { mode: 'normal', speed: 'normal', bots: 2 });
    await start(page);
    await humanTurn(page);
    await page.locator('#gRaise').click();
    await expect.poll(() => freqs(page), { timeout: 15_000 }).toContain(FREQ.bidBot);
  });

  test('«Не верю!» звучит и ждёт очереди, партия продолжается', async ({ page }) => {
    await setup(page, { mode: 'normal', speed: 'fast', bots: 1 });
    await start(page);
    // ходим, пока ход не дойдёт до проверки ставки бота
    await expect(async () => {
      await humanTurn(page);
      const hasBid = await page.evaluate(() => Boolean(window.__perudo_v2.game.bid));
      if (hasBid) await page.locator('#gDudo').click(); else await page.locator('#gRaise').click();
      expect(await freqs(page)).toContain(FREQ.dudo);
    }).toPass({ timeout: 20_000, intervals: [300] });
  });

  test('режим запоминается между перезагрузками', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__perudo_v2.setSoundMode('quiet'));
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__perudo_v2));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.settings')).soundMode);
    expect(saved).toBe('quiet');
    await page.evaluate(() => window.__perudo_v2.setSoundMode('мусор'));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perudo.settings')).soundMode)).toBe('off');
  });

  test('если звук недоступен, игра работает без ошибок', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await setup(page, { mode: 'normal', speed: 'fast', stub: 'window.AudioContext = function () { throw new Error("нет звука"); };' });
    await start(page);
    await humanTurn(page);
    await page.locator('#gRaise').click();
    await humanTurn(page);
    expect(errors).toEqual([]);
  });
});
