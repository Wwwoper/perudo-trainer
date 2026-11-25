// radio_keys.test.js — какая кнопка радиогруппы выбирается по клавише.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextRadioIndex } from '../src/ui/radio_keys.js';

describe('nextRadioIndex', () => {
  it('стрелки вправо и вниз идут вперёд, влево и вверх — назад', () => {
    assert.equal(nextRadioIndex(2, 6, 'ArrowRight'), 3);
    assert.equal(nextRadioIndex(2, 6, 'ArrowDown'), 3);
    assert.equal(nextRadioIndex(2, 6, 'ArrowLeft'), 1);
    assert.equal(nextRadioIndex(2, 6, 'ArrowUp'), 1);
  });
  it('стрелки по кругу, как у радиокнопок', () => {
    assert.equal(nextRadioIndex(5, 6, 'ArrowRight'), 0);
    assert.equal(nextRadioIndex(0, 6, 'ArrowLeft'), 5);
  });
  it('Home и End — к первой и последней', () => {
    assert.equal(nextRadioIndex(3, 6, 'Home'), 0);
    assert.equal(nextRadioIndex(3, 6, 'End'), 5);
    assert.equal(nextRadioIndex(0, 6, 'Home'), 0);
  });
  it('другие клавиши не перехватываются', () => {
    for (const key of ['Enter', ' ', 'Tab', 'a', 'PageDown']) assert.equal(nextRadioIndex(1, 6, key), null);
  });
  it('нет кнопок — ничего не выбирается', () => {
    assert.equal(nextRadioIndex(0, 0, 'ArrowRight'), null);
    assert.equal(nextRadioIndex(0, NaN, 'Home'), null);
  });
  it('фокус не на кнопке: отсчёт от первой', () => {
    assert.equal(nextRadioIndex(-1, 4, 'ArrowRight'), 1);
    assert.equal(nextRadioIndex(NaN, 4, 'End'), 3);
  });
  it('одна кнопка: остаётся на ней', () => {
    assert.equal(nextRadioIndex(0, 1, 'ArrowRight'), 0);
    assert.equal(nextRadioIndex(0, 1, 'ArrowLeft'), 0);
  });
});
