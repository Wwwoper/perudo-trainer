import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, createStopwatch, sanitizeTimerPref, MAX_SHOWN_MS, TIMER_NOTE, TIMER_LABEL } from '../src/practice_timer.js';

describe('formatElapsed', () => {
  test('минуты и секунды', () => {
    assert.equal(formatElapsed(0), '0:00');
    assert.equal(formatElapsed(999), '0:00');
    assert.equal(formatElapsed(7000), '0:07');
    assert.equal(formatElapsed(65000), '1:05');
    assert.equal(formatElapsed(600000), '10:00');
  });
  test('мусор и отрицательные → 0:00, большие значения ограничены', () => {
    for (const v of [-5, NaN, Infinity, undefined, null, 'x']) assert.equal(formatElapsed(v), '0:00', String(v));
    assert.equal(formatElapsed(MAX_SHOWN_MS * 10), '99:59');
  });
});

describe('createStopwatch', () => {
  const clock = () => { let t = 1000; return { now: () => t, add: (d) => { t += d; } }; };
  test('до запуска — ноль и не идёт', () => {
    const c = clock(); const s = createStopwatch(c.now);
    assert.equal(s.elapsed(), 0);
    assert.equal(s.running(), false);
    s.stop();
    assert.equal(s.running(), false);
  });
  test('идёт, останавливается и хранит значение', () => {
    const c = clock(); const s = createStopwatch(c.now);
    s.start(); c.add(4000);
    assert.equal(s.running(), true);
    assert.equal(s.elapsed(), 4000);
    s.stop(); c.add(9000);
    assert.equal(s.elapsed(), 4000);
    assert.equal(s.running(), false);
    s.stop(); c.add(1);
    assert.equal(s.elapsed(), 4000);
  });
  test('start начинает заново, reset обнуляет', () => {
    const c = clock(); const s = createStopwatch(c.now);
    s.start(); c.add(5000); s.stop();
    s.start(); c.add(2000);
    assert.equal(s.elapsed(), 2000);
    s.reset();
    assert.equal(s.elapsed(), 0);
  });
  test('часы, идущие назад, не дают отрицательного времени', () => {
    let t = 5000; const s = createStopwatch(() => t);
    s.start(); t = 1000;
    assert.equal(s.elapsed(), 0);
  });
});

describe('настройка и тексты', () => {
  test('только true включает', () => {
    assert.equal(sanitizeTimerPref(true), true);
    for (const v of [false, 1, 'true', null, undefined, {}]) assert.equal(sanitizeTimerPref(v), false);
  });
  test('текст говорит, что время не влияет на оценку, и без оценочных слов', () => {
    assert.match(TIMER_NOTE, /не влияет на оценку/);
    assert.doesNotMatch(`${TIMER_NOTE} ${TIMER_LABEL}`, /обманщик|врёт|блефует|штраф|быстр/i);
  });
});
