// count_picker.test.js — выбор числа кнопками.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampCount } from '../src/ui/count_picker.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('clampCount', () => {
  it('держит значение в границах и округляет', () => {
    assert.equal(clampCount(7, 1, 5, 3), 5);
    assert.equal(clampCount(0, 1, 5, 3), 1);
    assert.equal(clampCount('4', 1, 5, 3), 4);
    assert.equal(clampCount(2.6, 1, 5, 3), 3);
  });
  it('мусор и пустое значение — запасное число', () => {
    for (const bad of ['', null, undefined, 'abc', NaN, Infinity]) assert.equal(clampCount(bad, 1, 10, 5), 5, String(bad));
  });
});

describe('разметка «Кубики» и «Соперники»', () => {
  it('«Кубики» — отдельная карточка перед «Соперниками»', () => {
    assert.ok(html.indexOf('id="gDiceLabel"') > 0);
    assert.ok(html.indexOf('id="gDiceLabel"') < html.indexOf('id="gOppLabel"'));
    assert.ok(html.indexOf('id="gOppLabel"') < html.indexOf('id="gBotStyles"'));
  });
  it('у каждого выбора есть кнопки-контейнер и скрытое числовое поле с прежним id', () => {
    for (const [pick, input, min, max] of [['gDicePick', 'gDice', 1, 10], ['gBotsPick', 'gBots', 1, 5]]) {
      assert.match(html, new RegExp(`id="${pick}" class="count-picker"`));
      assert.match(html, new RegExp(`<input id="${input}" class="count-input" type="number" min="${min}" max="${max}"[^>]*tabindex="-1" aria-hidden="true">`));
    }
  });
  it('в «Соперниках» порядок: число ботов → стили → уровень → пара памяти/стилей', () => {
    const order = ['id="gBotsPick"', 'id="gBotStyles"', 'id="gBotLevel"', 'id="gMemoryOpt"'].map((k) => html.indexOf(k));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((i) => i > 0));
  });
  it('«Кубиков каждому» и «Ботов» полями ввода больше не показываются', () => {
    assert.ok(!/<label class="field">Кубиков каждому/.test(html));
    assert.ok(!/<label class="field">Ботов/.test(html));
  });
});
