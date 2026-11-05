import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  drillStep, hintOpenFor, stepNote, prefillExpected, PARTIAL_ATTEMPTS, STEP_EXAMPLE, STEP_PARTIAL, STEP_SOLO,
} from '../src/drill_steps.js';

const root = new URL('../', import.meta.url);
const BANNED = /обманщик|врёт|блефует/i;

describe('ступени упражнений', () => {
  it('«Оценка в уме»: пример → частично (две попытки) → самостоятельно', () => {
    assert.equal(drillStep('A', 0), STEP_EXAMPLE);
    for (let n = 1; n <= PARTIAL_ATTEMPTS; n++) assert.equal(drillStep('A', n), STEP_PARTIAL, `попытка ${n}`);
    assert.equal(drillStep('A', PARTIAL_ATTEMPTS + 1), STEP_SOLO);
    assert.equal(drillStep('A', 500), STEP_SOLO);
  });
  it('«Правило единиц»: пример → самостоятельно', () => {
    assert.equal(drillStep('B', 0), STEP_EXAMPLE);
    assert.equal(drillStep('B', 1), STEP_SOLO);
    assert.equal(drillStep('B', 2), STEP_SOLO);
  });
  it('мусор вместо числа попыток — как первая попытка', () => {
    for (const v of [undefined, null, 'x', -4, 1.5, NaN, {}]) assert.equal(drillStep('A', v), STEP_EXAMPLE);
  });
  it('памятка раскрыта только на первой ступени', () => {
    assert.equal(hintOpenFor(STEP_EXAMPLE), true);
    assert.equal(hintOpenFor(STEP_PARTIAL), false);
    assert.equal(hintOpenFor(STEP_SOLO), false);
  });
  it('пояснения: есть на первых ступенях, на последней пусто', () => {
    assert.match(stepNote('A', STEP_EXAMPLE), /разберите пример/);
    assert.match(stepNote('A', STEP_PARTIAL), /Первое число уже подставлено/);
    assert.equal(stepNote('A', STEP_SOLO), '');
    assert.match(stepNote('B', STEP_EXAMPLE), /правило/);
    assert.equal(stepNote('B', STEP_SOLO), '');
    assert.equal(stepNote('Z', STEP_EXAMPLE), '');
    for (const k of ['A', 'B']) for (const s of [STEP_EXAMPLE, STEP_PARTIAL, STEP_SOLO]) assert.doesNotMatch(stepNote(k, s), BANNED);
  });
  it('подставленное ожидание: свои + чужие × шанс, один знак', () => {
    assert.equal(prefillExpected(3, 10, 3), '6.3');   // пример из памятки
    assert.equal(prefillExpected(2, 12, 1), '4.0');   // единицы: шанс 1/6
    assert.equal(prefillExpected(0, 0, 4), '0.0');
  });
  it('разметка: места для пояснений есть в обоих упражнениях, руководство описывает ступени', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    assert.match(html, /<p id="dAScaffold" class="muted drill-scaffold" hidden><\/p>/);
    assert.match(html, /<p id="dBScaffold" class="muted drill-scaffold" hidden><\/p>/);
    const g = readFileSync(new URL('docs/guide/drill.html', root), 'utf8').replace(/<[^>]+>/g, ' ');
    assert.match(g, /первая задача/i);
    assert.match(g, /подставлено/);
  });
});
