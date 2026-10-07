// table.test.js — тесты для table.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderDie, renderHand, renderBid, renderTable } from '../src/table.js';

describe('renderDie', () => {
  it('рендерит кубик', () => {
    const html = renderDie(5);
    assert.ok(html.includes('pd'));
    assert.ok(html.includes('class="on"'));
  });
  it('рендерит джокер', () => {
    const html = renderDie(1, 'md', true);
    assert.ok(html.includes('wild'));
  });
});

describe('renderHand', () => {
  it('рендерит руку', () => {
    const html = renderHand([1, 3, 5]);
    assert.ok(html.includes('pd'));
  });
  it('рендерит пустую руку', () => {
    const html = renderHand([]);
    assert.ok(html.includes('—'));
  });
});

describe('renderBid', () => {
  it('рендерит ставку', () => {
    const html = renderBid(8, 4);
    assert.ok(html.includes('8'));
    assert.ok(html.includes('chip'));
  });
});

describe('renderTable', () => {
  it('рендерит стол на 2 игроков', () => {
    const game = {
      players: [
        { id: 'human', name: 'Вы', dice: 5, alive: true, isHuman: true, hand: [1, 2, 3, 4, 5] },
        { id: 'bot', name: 'Бот', dice: 5, alive: true, isHuman: false, hand: [1, 1, 2, 3, 4] },
      ],
      round: 1,
      bid: null,
      palifico: false,
    };
    const html = renderTable(game, 0, { showOpponentReasoning: false });
    assert.ok(html.includes('game-table'));
    assert.ok(html.includes('Раунд 1'));
  });
});
