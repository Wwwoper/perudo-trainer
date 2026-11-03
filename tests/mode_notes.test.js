import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUEL_BADGE, DUEL_NOTE, SIM_NOTE, deviationLabel, duelSessionText } from '../src/mode_notes.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BANNED = /обманщик|врёт|блефует|ошибк[аи] игрока/i;

describe('тексты Дуэли и Симуляции', () => {
  it('метка «Продвинутый режим» и оговорка есть в index.html', () => {
    const html = text(read('index.html'));
    assert.ok(html.includes(DUEL_BADGE));
    assert.ok(html.includes(DUEL_NOTE));
    assert.ok(html.includes(SIM_NOTE));
  });
  it('SIM_NOTE называет условия сравнения с калькулятором', () => {
    assert.match(SIM_NOTE, /без известной вам руки/);
    assert.match(SIM_NOTE, /только при тех же условиях/);
    assert.match(SIM_NOTE, /джокеры/);
  });
  it('редкий ход не называется ошибкой', () => {
    assert.equal(deviationLabel(0.01), 'редкий для решателя ход');
    assert.equal(deviationLabel(0.5), 'в рамках');
    const s = duelSessionText({ games: 2, wins: 1, dev: 3, moves: 7 });
    assert.match(s, /редких для решателя ходов: 3 из 7/);
    assert.match(s, /не обязательно ошибка/);
    assert.doesNotMatch(s, /отклонени/);
  });
  it('руководство повторяет оговорки и не использует «отклонения»', () => {
    const g = text(read('docs/guide/duel-sim.html'));
    assert.ok(g.includes(DUEL_BADGE));
    assert.ok(g.includes('без известной вам руки'));
    assert.doesNotMatch(g, /редких отклонений/);
  });
  it('нет запрещённых слов', () => {
    for (const t of [DUEL_NOTE, SIM_NOTE, DUEL_BADGE]) assert.doesNotMatch(t, BANNED);
  });
});
