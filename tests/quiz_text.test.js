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

import { summaryView } from '../src/quiz_text.js';

const sample = (over = {}) => ({
  correct: 14, total: 20, points: 17, max: 24, guess: 11.4, gain: 5.6,
  kinds: [
    { kind: 'lastTrue', name: 'Верность ставки', n: 6, correct: 5, rate: 0.83, guessRate: 0.55 },
    { kind: 'countFace', name: 'Сколько на столе', n: 4, correct: 1, rate: 0.35, guessRate: 0.37 },
  ],
  weakest: null,
  ...over,
});

test('summaryView: заголовок, баллы и сравнение с догадкой', () => {
  const v = summaryView(sample());
  assert.equal(v.headline, '14 из 20');
  assert.match(v.points, /17 из 24/);
  assert.match(v.points, /около 11/);
  assert.match(v.points, /на 6 баллов больше/);
  assert.equal(v.kinds[0].text, '5 из 6');
  assert.equal(v.kinds[0].rate, 83);
  assert.equal(v.kinds[0].guess, 55);
  assert.match(v.kinds[0].note, /55 %/);
  assert.match(v.weak, /Ни один вид/);
});

test('summaryView: хуже догадки и на уровне догадки, слабое место называется', () => {
  const worse = summaryView(sample({ gain: -3.2, weakest: { name: 'Сколько на столе', rate: 0.35, guessRate: 0.37 } }));
  assert.match(worse.points, /на 3 балла меньше/);
  assert.match(worse.weak, /Сколько на столе.*35 %.*37 %/);
  assert.match(summaryView(sample({ gain: 0.2 })).points, /на уровне/);
});
