// options_view.test.js — разметка списка вариантов хода.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Perudo = { pct: (x) => `${(x * 100).toFixed(1)}%` };
const { optionsHtml } = await import('../src/ui/options_view.js');
const { optionsNote } = await import('../src/trainer_text.js');

const dudo = { type: 'dudo', p: 0.7, success: 0.3, meetsThreshold: false };
const min = { type: 'minRaise', q: 2, f: 1, p: 0.8, success: 0.8, meetsThreshold: true };
const safe = { type: 'safeRaise', q: 5, f: 3, p: 0.6, success: 0.6, meetsThreshold: true };

describe('optionsHtml', () => {
  it('по строке на вариант, заголовок с порогом', () => {
    const h = optionsHtml([dudo, min, safe], 0.5);
    assert.equal((h.match(/<li /g) || []).length, 3);
    assert.match(h, /Варианты по шансу · ✓ = порог 50\.0%/);
    assert.match(h, /проверка сработает[^]*?<span class="trainer-option-chance"><b>30\.0%<\/b>/);
    assert.match(h, /ставка верна[^]*?<span class="trainer-option-chance"><b>80\.0%<\/b>/);
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
    assert.match(optionsHtml([{ ...min, isBestSafe: true }], 0.5), /она же самая сильная из проходящих порог/);
  });
  it('нет безопасных повышений, но «Не верю» проходит порог — подсказка называет «Не верю»', () => {
    const ok = { ...dudo, meetsThreshold: true };
    const h = optionsHtml([ok, { ...min, meetsThreshold: false }], 0.5);
    assert.match(h, /Ни одно повышение не проходит порог, зато «Не верю» сработает с шансом выше порога/);
  });
  it('ни один ход не проходит порог — подсказка про наибольший шанс, без «Не верю часто лучший»', () => {
    const h = optionsHtml([dudo, { ...min, meetsThreshold: false }], 0.5);
    assert.match(h, /Ни один ход не проходит порог/);
    assert.ok(!h.includes('часто лучший'));
  });
  it('есть безопасное повышение — подсказки нет', () => {
    const h = optionsHtml([dudo, safe], 0.5);
    assert.ok(!h.includes('Ни одно повышение') && !h.includes('Ни один ход'));
  });
  it('колонки: вариант | чип | вероятность; у «Не верю» колонка чипа пустая, чипа нет внутри названия', () => {
    const h = optionsHtml([dudo, min], 0.5);
    const [d, m] = h.split('<li ').slice(1);
    assert.match(d, /<span class="trainer-option-chip"><\/span>/);
    assert.match(m, /<span class="trainer-option-chip"><span class="chip xs">2/);
    assert.ok(!m.slice(0, m.indexOf('trainer-option-chip')).includes('class="chip'));   // чип не внутри названия
  });
  it('пустой список не падает', () => {
    assert.match(optionsHtml([], 0.5), /<ul class="trainer-options"><\/ul>/);
  });
});

describe('подписи вариантов без слова «безопасная»', () => {
  it('в списке вариантов и в пояснении слова «безопасн» нет: порог — критерий, а не гарантия', () => {
    const all = optionsHtml([
      { type: 'dudo', success: 0.4, meetsThreshold: false },
      { type: 'minRaise', q: 4, f: 3, success: 0.6, meetsThreshold: true, isBestSafe: true },
      { type: 'safeRaise', q: 5, f: 3, success: 0.5, meetsThreshold: true },
    ], 0.5);
    assert.ok(!/безопасн/i.test(all), all);
    assert.match(all, /Самая сильная из проходящих порог/);
    assert.ok(!/безопасн/i.test(optionsNote([{ type: 'dudo', success: 0.6, meetsThreshold: true }])));
    assert.ok(!/безопасн/i.test(optionsNote([{ type: 'dudo', success: 0.2, meetsThreshold: false }])));
  });
});
