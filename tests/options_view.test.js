// options_view.test.js — разметка списка вариантов хода.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Perudo = { pct: (x) => `${(x * 100).toFixed(1)}%` };
const { optionsHtml } = await import('../src/ui/options_view.js');

const dudo = { type: 'dudo', p: 0.7, success: 0.3, meetsThreshold: false };
const min = { type: 'minRaise', q: 2, f: 1, p: 0.8, success: 0.8, meetsThreshold: true };
const safe = { type: 'safeRaise', q: 5, f: 3, p: 0.6, success: 0.6, meetsThreshold: true };

describe('optionsHtml', () => {
  it('по строке на вариант, заголовок с порогом', () => {
    const h = optionsHtml([dudo, min, safe], 0.5);
    assert.equal((h.match(/<li /g) || []).length, 3);
    assert.match(h, /Варианты по шансу · ✓ = порог 50\.0%/);
    assert.match(h, /проверка сработает: <b>30\.0%<\/b>/);
    assert.match(h, /ставка верна: <b>80\.0%<\/b>/);
  });
  it('галочка только у вариантов, проходящих порог', () => {
    const h = optionsHtml([dudo, min], 0.5);
    const [first, second] = h.split('<li ').slice(1);
    assert.ok(!first.includes('✓ Не верю'));
    assert.ok(second.includes('✓ Минимальное повышение'));
  });
  it('выбранный вариант отмечен', () => {
    const h = optionsHtml([{ ...dudo, chosen: true }, min], 0.5);
    assert.equal((h.match(/is-chosen/g) || []).length, 1);
    assert.equal((h.match(/ваш выбор/g) || []).length, 1);
  });
  it('минимальное повышение, оно же безопасное — подпись', () => {
    assert.match(optionsHtml([{ ...min, isBestSafe: true }], 0.5), /она же самая сильная безопасная/);
  });
  it('нет безопасных повышений — прежняя подсказка', () => {
    const h = optionsHtml([dudo, { ...min, meetsThreshold: false }], 0.5);
    assert.match(h, /Безопасных повышений выше порога нет/);
    assert.ok(!optionsHtml([dudo, safe], 0.5).includes('Безопасных повышений выше порога нет'));
  });
  it('пустой список не падает', () => {
    assert.match(optionsHtml([], 0.5), /<ul class="trainer-options"><\/ul>/);
  });
});
