// tests/stats_tabs.test.js — подвкладки «Статистики»: нормализация значения и клавиатурное движение.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STATS_TABS, DEFAULT_STATS_TAB, normalizeStatsTab, moveStatsTab } from '../src/stats_tabs.js';

describe('подвкладки статистики', () => {
  test('порядок вкладок и вкладка по умолчанию: главное — результаты', () => {
    assert.deepEqual(STATS_TABS, ['results', 'player', 'data']);
    assert.equal(DEFAULT_STATS_TAB, 'results');
  });

  test('normalizeStatsTab: известные значения остаются, мусор даёт «Результаты»', () => {
    for (const t of STATS_TABS) assert.equal(normalizeStatsTab(t), t);
    for (const bad of [null, undefined, '', 'Data', 'x', 0, {}, []]) assert.equal(normalizeStatsTab(bad), 'results');
  });

  test('moveStatsTab: стрелки идут по кругу', () => {
    assert.equal(moveStatsTab('results', 'ArrowRight'), 'player');
    assert.equal(moveStatsTab('player', 'ArrowRight'), 'data');
    assert.equal(moveStatsTab('data', 'ArrowRight'), 'results');
    assert.equal(moveStatsTab('results', 'ArrowLeft'), 'data');
    assert.equal(moveStatsTab('data', 'ArrowLeft'), 'player');
  });

  test('moveStatsTab: Home и End — к краям', () => {
    assert.equal(moveStatsTab('player', 'Home'), 'results');
    assert.equal(moveStatsTab('player', 'End'), 'data');
  });

  test('moveStatsTab: чужие клавиши не обрабатываются, неизвестная текущая вкладка считается «Результатами»', () => {
    for (const k of ['Enter', ' ', 'a', 'ArrowUp', 'Tab']) assert.equal(moveStatsTab('data', k), null);
    assert.equal(moveStatsTab('???', 'ArrowRight'), 'player');
  });
});
