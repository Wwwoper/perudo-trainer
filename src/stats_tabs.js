// src/stats_tabs.js — подвкладки «Статистики»: какие бывают и как двигаться по ним с клавиатуры (без DOM).

export const STATS_TABS = ['results', 'player', 'data'];
export const DEFAULT_STATS_TAB = 'results';

/** Любое неизвестное значение (в том числе из хранилища) превращается в вкладку по умолчанию. */
export function normalizeStatsTab(value) {
  return STATS_TABS.includes(value) ? value : DEFAULT_STATS_TAB;
}

/**
 * Куда перейти по клавише: ←/→ по кругу, Home/End — к краям.
 * Для остальных клавиш возвращает null (клавишу не трогаем).
 */
export function moveStatsTab(current, key) {
  const n = STATS_TABS.length;
  const i = STATS_TABS.indexOf(normalizeStatsTab(current));
  if (key === 'ArrowRight') return STATS_TABS[(i + 1) % n];
  if (key === 'ArrowLeft') return STATS_TABS[(i + n - 1) % n];
  if (key === 'Home') return STATS_TABS[0];
  if (key === 'End') return STATS_TABS[n - 1];
  return null;
}
