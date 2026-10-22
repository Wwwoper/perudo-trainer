// review_note.test.js — подпись под «Разбором» описывает то, что реально считается.
// Оценка и классификация — P.probBid (по вашим кубикам); второе число — с учётом стола (table_read.js).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { TABLE_TRUST } from '../src/table_read.js';
import { SOFTEN_FROM } from '../src/assist.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const note = html.match(/<small id="gReviewNote">([\s\S]*?)<\/small>/)?.[1].replace(/\s+/g, ' ');

describe('подпись под «Разбором»', () => {
  it('описывает оба числа и порог смягчения', () => {
    assert.ok(note, 'подпись найдена');
    assert.match(note, /по вашим кубикам/);
    assert.match(note, /с учётом ставок за столом/);
    assert.match(note, new RegExp(`доверие ${TABLE_TRUST.toFixed(1)}`), 'доверие в подписи равно константе');
    assert.match(note, new RegExp(`не ниже ${Math.round(SOFTEN_FROM * 100)}%`), 'порог смягчения в подписи равен константе');
    assert.match(note, /50%/);
  });
  it('не говорит, что ставки соперников не учитываются', () => {
    assert.doesNotMatch(note, /не учитываются/);
  });
});

describe('источник числа в «Разборе»', () => {
  it('оценка и классификация хода идут по P.probBid; probBidRead — только дополнительные данные записи', () => {
    const src = readFileSync(new URL('../src/app_v2.js', import.meta.url), 'utf8');
    assert.match(src, /const p = P\.probBid\(q, f, total, me\.hand, !game\.palifico\);\s*\n\s*const entry = addReview\('raise', p,/);
    assert.equal((src.match(/probBidRead/g) || []).length, 1, 'probBidRead вызывается только в tableRead');
  });
});
