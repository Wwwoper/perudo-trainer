// situation_card.test.js — карточка «Картина стола»: когда видна, разметка, подсказка плана только по кнопке.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowCard, situationCardHtml, TYPE_LABELS } from '../src/ui/situation_card.js';

const lines = [
  { id: 'phase', type: 'fact', text: 'Начало партии: на столе 20 кубиков.' },
  { id: 'gap', type: 'estimate', text: 'Ниже среднего.' },
  { id: 'obs:b1', type: 'hypothesis', text: 'Мария называла: 4. Это предположение.' },
];
const plan = [{ id: 'plan_dudo', type: 'estimate', text: 'Проверка: шанс 38 %.' }];

describe('shouldShowCard', () => {
  const base = { active: true, myTurn: true };
  it('матрица: режим помощи × объяснения', () => {
    const want = {
      novice: { auto: true, off: false, after: false, full: true },
      training: { auto: false, off: false, after: false, full: true },
      game: { auto: false, off: false, after: false, full: false },
    };
    for (const [assistMode, row] of Object.entries(want)) {
      for (const [explain, expected] of Object.entries(row)) {
        assert.equal(shouldShowCard({ ...base, assistMode, explain }), expected, `${assistMode}/${explain}`);
      }
    }
  });
  it('только на вашем ходу в идущей партии', () => {
    assert.equal(shouldShowCard({ assistMode: 'novice', explain: 'auto', active: false, myTurn: true }), false);
    assert.equal(shouldShowCard({ assistMode: 'novice', explain: 'auto', active: true, myTurn: false }), false);
  });
  it('мусор вместо режима — как Тренировка', () => {
    assert.equal(shouldShowCard({ ...base, assistMode: 'нет', explain: 'auto' }), false);
    assert.equal(shouldShowCard({ ...base, assistMode: 'нет', explain: 'full' }), true);
  });
});

describe('situationCardHtml', () => {
  it('свёрнута по умолчанию; раскрыта по состоянию', () => {
    assert.ok(!/<details[^>]* open/.test(situationCardHtml({ lines })));
    assert.ok(/<details[^>]* open/.test(situationCardHtml({ lines, open: true })));
  });
  it('тип строки назван словом', () => {
    const html = situationCardHtml({ lines });
    for (const t of ['Факт', 'Расчёт', 'Предположение']) assert.ok(html.includes(`>${t}<`), t);
    assert.deepEqual(Object.values(TYPE_LABELS), ['Факт', 'Расчёт', 'Предположение']);
    assert.match(html, /class="sit-line sit-hypothesis"/);
  });
  it('текст экранируется', () => {
    const html = situationCardHtml({ lines: [{ id: 'x', type: 'fact', text: '<img src=x onerror=1>' }] });
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
  });
  it('неизвестный тип строки не ломает разметку', () => {
    assert.match(situationCardHtml({ lines: [{ id: 'x', type: '??', text: 'т' }] }), /sit-fact/);
  });
  it('подсказка плана: пока кнопка не нажата, текста плана в разметке нет', () => {
    const html = situationCardHtml({ lines, plan, planOpen: false });
    assert.ok(html.includes('id="gPlanBtn"'));
    assert.ok(html.includes('aria-expanded="false"'));
    assert.ok(!html.includes('Проверка: шанс 38 %'));
    assert.ok(!html.includes('gPlanBody'));
  });
  it('после нажатия план показан, кнопка предлагает скрыть', () => {
    const html = situationCardHtml({ lines, plan, planOpen: true });
    assert.ok(html.includes('Проверка: шанс 38 %'));
    assert.ok(html.includes('aria-expanded="true"'));
    assert.ok(html.includes('Скрыть подсказку плана'));
  });
  it('нет плана — нет и кнопки', () => {
    assert.ok(!situationCardHtml({ lines, plan: [] }).includes('gPlanBtn'));
    assert.ok(!situationCardHtml({ lines }).includes('gPlanBtn'));
  });
});
