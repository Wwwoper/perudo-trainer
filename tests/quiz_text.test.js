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
