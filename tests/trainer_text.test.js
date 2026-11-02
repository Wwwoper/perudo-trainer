import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verdictText, VERDICT_GOOD, VERDICT_BAD, MODEL_NOTE } from '../src/trainer_text.js';

describe('trainer_text', () => {
  it('вердикт: верное и сомнительное решение, оба «по шансу»', () => {
    assert.equal(verdictText(true), VERDICT_GOOD);
    assert.equal(verdictText(false), VERDICT_BAD);
    for (const v of [VERDICT_GOOD, VERDICT_BAD]) assert.match(v, /по шансу$/);
    assert.match(VERDICT_GOOD, /Хорошее решение/);
    assert.match(VERDICT_BAD, /Сомнительное решение/);
  });
  it('оговорка называет, что именно оценено, и что это не выигрыш партии', () => {
    assert.match(MODEL_NOTE, /по шансу ставки/);
    assert.match(MODEL_NOTE, /не по выигрышу партии/);
  });
  it('в текстах нет запрещённых слов и абсолютных обещаний', () => {
    for (const t of [VERDICT_GOOD, VERDICT_BAD, MODEL_NOTE]) assert.doesNotMatch(t, /обманщик|врёт|блеф|гарантир|всегда|лучший ход/i);
  });
});
