// drill_note.test.js — пояснения к ответу в «Оценке в уме».
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { noSafeText, riskNote } from '../src/drill_note.js';

describe('noSafeText', () => {
  it('объясняет, что безопасной ставки нет, и не содержит «0.0% ✔»', () => {
    const t = noSafeText('27.3%');
    assert.match(t, /Безопасной ставки нет/);
    assert.match(t, /27\.3%/);
    assert.match(t, /Правильный ответ — 0/);
    assert.doesNotMatch(t, /✔/);
  });
});

describe('riskNote', () => {
  const base = { safe: 6, chanceAnswer: '38%', chanceSafe: '61%' };
  it('ответ выше безопасного, принят по допуску — строка про шанс', () => {
    const t = riskNote({ ...base, answer: 7, accepted: true });
    assert.match(t, /принята по допуску, но шанс 38% — меньше 50%/);
    assert.match(t, /Безопасная — 6 \(61%\)/);
  });
  it('ответ выше допуска — «не принята»', () => {
    assert.match(riskNote({ ...base, answer: 8, accepted: false }), /не принята/);
  });
  it('точный или ниже безопасного — строки нет', () => {
    assert.strictEqual(riskNote({ ...base, answer: 6, accepted: true }), '');
    assert.strictEqual(riskNote({ ...base, answer: 5, accepted: true }), '');
  });
  it('safe = 0 — строки нет (есть отдельный текст)', () => {
    assert.strictEqual(riskNote({ ...base, safe: 0, answer: 1, accepted: true }), '');
  });
});
