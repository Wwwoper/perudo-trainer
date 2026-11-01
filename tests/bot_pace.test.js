import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { botDelayMs, isStepMode, needsStepButton, BOT_DELAYS } from '../src/bot_pace.js';
import { BOT_SPEEDS } from '../src/game_settings.js';

describe('bot_pace', () => {
  it('«Пошагово» без задержки, остальные темпы с задержкой по возрастанию скорости', () => {
    assert.equal(botDelayMs('step'), null);
    assert.equal(isStepMode('step'), true);
    assert.ok(botDelayMs('slow') > botDelayMs('normal'));
    assert.ok(botDelayMs('normal') > botDelayMs('fast'));
    assert.equal(botDelayMs('fast'), 320);
  });
  it('неизвестный или пустой темп считается обычным, а не пошаговым', () => {
    for (const v of [undefined, null, '', 'turbo', 5, {}, '__proto__', 'constructor']) {
      assert.equal(botDelayMs(v), BOT_DELAYS.normal, String(v));
      assert.equal(isStepMode(v), false);
    }
  });
  it('все темпы настроек покрыты: у каждого либо задержка, либо пошаговый режим', () => {
    for (const s of BOT_SPEEDS) {
      const d = botDelayMs(s);
      assert.ok(s === 'step' ? d === null : Number.isInteger(d) && d > 0, s);
    }
  });
  it('кнопка «Ход бота»: только пошагово, при активной партии и ходе не человека', () => {
    const base = { speed: 'step', state: 'active', currentPlayer: 1 };
    assert.equal(needsStepButton(base), true);
    assert.equal(needsStepButton({ ...base, currentPlayer: 0 }), false);
    assert.equal(needsStepButton({ ...base, state: 'finished' }), false);
    assert.equal(needsStepButton({ ...base, state: 'round_resolving' }), false);
    assert.equal(needsStepButton({ ...base, speed: 'normal' }), false);
  });
});
