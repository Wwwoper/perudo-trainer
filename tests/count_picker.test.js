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

describe('разметка «Параметры партии» и «Соперники»', () => {
  it('«Параметры партии» — первая карточка: боты, кубики, темп; «Соперники» идут после неё', () => {
    const order = ['id="gParamsLabel"', 'id="gBotsPick"', 'id="gDicePick"', 'id="gSpeedPick"', 'id="gOppLabel"', 'id="gBotStyles"']
      .map((k) => html.indexOf(k));
    assert.ok(order.every((i) => i > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(!html.includes('id="gDiceLabel"'), 'отдельной карточки «Кубики» больше нет');
  });
  it('у каждого выбора есть контейнер кнопок и скрытое поле с прежним id', () => {
    for (const [pick, input, min, max, cls] of [['gDicePick', 'gDice', 1, 10, 'is-dice'], ['gBotsPick', 'gBots', 1, 5, 'is-bots']]) {
      assert.match(html, new RegExp(`id="${pick}" class="count-picker ${cls}"`));
      assert.match(html, new RegExp(`<input id="${input}" class="count-input" type="number" min="${min}" max="${max}"[^>]*tabindex="-1" aria-hidden="true">`));
    }
    assert.match(html, /id="gSpeedPick" class="count-picker is-speed"/);
    assert.match(html, /<select id="gSpeed" class="count-input" tabindex="-1" aria-hidden="true">/);
  });
  it('подпись кубиков говорит, что кубики у каждого игрока в начале партии', () => {
    assert.match(html, /id="gDiceName">Кубиков у каждого игрока в начале партии</);
  });
  it('в «Соперниках» порядок: стили → уровень → пара памяти/стилей; числа ботов там уже нет', () => {
    const opp = html.slice(html.indexOf('id="gOppLabel"'), html.indexOf('id="gHelpLabel"'));
    assert.ok(!opp.includes('gBotsPick'));
    const order = ['id="gBotStyles"', 'id="gBotLevel"', 'id="gMemoryOpt"'].map((k) => opp.indexOf(k));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((i) => i > 0));
  });
  it('«Кубиков каждому» и «Ботов» полями ввода больше не показываются', () => {
    assert.ok(!/<label class="field">Кубиков каждому/.test(html));
    assert.ok(!/<label class="field">Ботов/.test(html));
  });
});
