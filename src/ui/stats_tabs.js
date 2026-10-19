// src/ui/stats_tabs.js — переключатель «Результаты / Игрок / Данные» внутри «Статистики».

import { $, $$ } from './common.js';
import { STATS_TABS, normalizeStatsTab, moveStatsTab } from '../stats_tabs.js';

const KEY = 'perudo.statsTab';          // только на время сеанса: хранилище может быть недоступно

function readSaved() {
  try { return sessionStorage.getItem(KEY); } catch (e) { return null; }
}

function save(tab) {
  try { sessionStorage.setItem(KEY, tab); } catch (e) { }
}

/** Показывает вкладку: переключает кнопки и панели. Возвращает показанную вкладку. */
export function showStatsTab(tab, { focus = false, remember = true } = {}) {
  const active = normalizeStatsTab(tab);
  for (const btn of $$('[data-st]')) {
    const on = btn.dataset.st === active;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  }
  for (const id of STATS_TABS) {
    const panel = $(`[data-st-panel="${id}"]`);
    if (panel) panel.hidden = id !== active;
  }
  if (remember) save(active);
  return active;
}

/** Подключает переключатель; последняя выбранная вкладка помнится до закрытия вкладки браузера. */
export function setupStatsTabs() {
  const list = $('#stTabs');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-st]');
    if (btn) showStatsTab(btn.dataset.st);
  });
  list.addEventListener('keydown', (e) => {
    const cur = e.target.closest('[data-st]')?.dataset.st;
    const next = cur && moveStatsTab(cur, e.key);
    if (!next) return;
    e.preventDefault();
    showStatsTab(next, { focus: true });
  });
  showStatsTab(readSaved(), { remember: false });
}
