import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsText, progressLabel, resultLine, endLine } from '../src/quiz_text.js';

test('pointsText: склонение «балл»', () => {
  assert.equal(pointsText(1), '1 балл');
  assert.equal(pointsText(2), '2 балла');
  assert.equal(pointsText(5), '5 баллов');
  assert.equal(pointsText(11), '11 баллов');
  assert.equal(pointsText(21), '21 балл');
  assert.equal(pointsText(0), '0 баллов');
  assert.equal(pointsText(undefined), '0 баллов');
});

test('progressLabel: стол и вопрос считаются с единицы', () => {
  assert.equal(progressLabel({ table: 1, q: 2 }, 5, 4), 'Стол 2 из 5 · вопрос 3 из 4');
});

test('resultLine: верно, точно, почти и мимо', () => {
  assert.deepEqual(resultLine({ ok: true, points: 1, max: 1 }), { tone: 'ok', text: 'Верно, +1 балл' });
  assert.deepEqual(resultLine({ ok: true, points: 2, max: 2 }), { tone: 'ok', text: 'Точно, +2 балла' });
  assert.deepEqual(resultLine({ ok: false, points: 1, max: 2 }), { tone: 'near', text: 'Почти: ошибка в один кубик, +1 балл' });
  assert.deepEqual(resultLine({ ok: false, points: 0, max: 1 }), { tone: 'bad', text: 'Мимо, 0 баллов' });
});

test('endLine: верные ответы и баллы', () => {
  assert.equal(endLine({ correct: 14, total: 20, points: 17, max: 24 }), 'Верно: 14 из 20. Баллов: 17 из 24.');
});

import { summaryView, SURE_GAP } from '../src/quiz_text.js';

const sample = (over = {}) => ({
  correct: 14, total: 20, points: 17, max: 24, guess: 11.4, gain: 5.6,
  kinds: [
    { kind: 'lastTrue', name: 'Верность ставки', n: 6, correct: 5, rate: 0.83, guessRate: 0.55 },
    { kind: 'countFace', name: 'Сколько на столе', n: 4, correct: 1, rate: 0.35, guessRate: 0.37 },
  ],
  weakest: null,
  ...over,
});

test('summaryView: заголовок, баллы и сравнение с ответом «всегда одно и то же»', () => {
  const v = summaryView(sample());
  assert.equal(v.headline, '14 из 20');
  assert.match(v.points, /17 из 24/);
  assert.match(v.points, /всегда отвечать одним и тем же ответом, набралось бы около 11/);
  assert.match(v.points, /заметно лучше/);
  assert.equal(v.kinds[0].text, '5 из 6');
  assert.equal(v.kinds[0].rate, 83);
  assert.equal(v.kinds[0].guess, 55);
  assert.match(v.kinds[0].note, /одном и том же ответе.*55 %/);
  assert.match(v.weak, /Ни один вид/);
});

test('summaryView: «лучше» и «хуже» только при заметной разнице, иначе «судить рано»', () => {
  assert.match(summaryView(sample({ gain: -3.2 })).points, /хуже/);
  assert.match(summaryView(sample({ gain: SURE_GAP })).points, /заметно лучше/);
  for (const gain of [0, 2.9, -2.9]) assert.match(summaryView(sample({ gain })).points, /судить рано/);
  const worse = summaryView(sample({ gain: -3.2, weakest: { name: 'Сколько на столе', rate: 0.35, guessRate: 0.37 } }));
  assert.match(worse.weak, /Сколько на столе.*35 %.*37 %/);
});

import { splitDice } from '../src/quiz_text.js';

test('splitDice: символы кубиков становятся гранями, остальное — текстом', () => {
  assert.deepEqual(splitDice('Ставка Ирины: 3 × ⚄. Верна?'), [
    { text: 'Ставка Ирины: 3 × ' }, { face: 5 }, { text: '. Верна?' },
  ]);
  assert.deepEqual(splitDice('⚀⚅'), [{ face: 1 }, { face: 6 }]);
  assert.deepEqual(splitDice('без кубиков'), [{ text: 'без кубиков' }]);
  assert.deepEqual(splitDice(''), []);
  assert.deepEqual(splitDice(null), []);
});

import { verdictMark } from '../src/quiz_text.js';

test('verdictMark: свой значок для верно, почти и мимо', () => {
  assert.equal(verdictMark('ok'), '✓');
  assert.equal(verdictMark('near'), '≈');
  assert.equal(verdictMark('bad'), '✗');
  assert.equal(verdictMark('что-то'), '✗');
});
