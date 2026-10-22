// review_note.test.js — подпись под «Разбором» описывает то, что реально считается.
// Число в «Разборе» — P.probBid (по вашим кубикам); ставки соперников и «доверие» в нём не участвуют.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const note = html.match(/<small id="gReviewNote">([\s\S]*?)<\/small>/)?.[1].replace(/\s+/g, ' ');

describe('подпись под «Разбором»', () => {
  it('есть и говорит, что ставки соперников не учитываются', () => {
    assert.ok(note, 'подпись найдена');
    assert.match(note, /по вашим кубикам/);
    assert.match(note, /ставки соперников не учитываются/);
    assert.match(note, /50%/);
  });
  it('не обещает поправку на чужие ставки и доверие', () => {
    assert.doesNotMatch(note, /поправк/);
    assert.doesNotMatch(note, /доверие/);
  });
});

describe('источник числа в «Разборе»', () => {
  it('оценка и классификация хода идут по P.probBid; probBidRead — только дополнительные данные записи', () => {
    const src = readFileSync(new URL('../src/app_v2.js', import.meta.url), 'utf8');
    assert.match(src, /const p = P\.probBid\(q, f, total, me\.hand, !game\.palifico\);\s*\n\s*const entry = addReview\('raise', p,/);
    assert.equal((src.match(/probBidRead/g) || []).length, 1, 'probBidRead вызывается только в tableRead');
  });
});
