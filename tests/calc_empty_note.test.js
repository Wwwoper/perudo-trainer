// calc_empty_note.test.js — пустая вкладка «Расчёт» объясняет, где искать расчёт в остальных режимах.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const text = html.match(/<p id="gPracticalEmpty"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/\s+/g, ' ').trim();

describe('подсказка на пустой вкладке «Расчёт»', () => {
  it('называет режимы с расчётом на ходу', () => {
    assert.ok(text, 'подсказка найдена');
    assert.match(text, /«Новичок» и «Тренировка»/);
  });
  it('говорит, что в остальных режимах будет итог после партии с ключевыми решениями', () => {
    assert.match(text, /В остальных режимах его нет/);
    assert.match(text, /после партии/);
    assert.match(text, /ключевыми решениями/);
  });
});
