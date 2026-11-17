// bots_auto_style.test.js — подпись «По умолчанию» называет стиль, который бот получит на самом деле.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoStyleLabel, pickBotStyles, BOT_STYLES } from '../src/bots.js';

describe('autoStyleLabel', () => {
  it('совпадает с реальной раздачей по кругу для 5 ботов', () => {
    const real = pickBotStyles(5, []);
    for (let i = 0; i < 5; i++) {
      const st = BOT_STYLES[real[i]];
      assert.equal(autoStyleLabel(i), `По умолчанию (${st.name})`);
    }
  });
  it('первые три бота получают Осторожного, Блефующего и Умного', () => {
    assert.match(autoStyleLabel(0), /Осторожный/);
    assert.match(autoStyleLabel(1), /Блефующий/);
    assert.match(autoStyleLabel(2), /Умный/);
    assert.match(autoStyleLabel(3), /Осторожный/);
  });
});
