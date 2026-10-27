// src/ui/theme.js — тема оформления: применение к странице и реакция на смену системной темы.

import { resolveTheme, sanitizeThemeMode } from '../theme.js';
import { getThemeMode, setThemeMode } from '../storage.js';

let mode = 'dark';
let media = null;

const systemPrefersDark = () => (media ? media.matches : null);

/** Ставит data-theme на <html> и цвет адресной строки браузера по фону темы. */
function apply() {
  const theme = resolveTheme(mode, systemPrefersDark());
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute('content', bg);
  return theme;
}

export function setupTheme() {
  mode = getThemeMode();
  try {
    media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', () => { if (mode === 'system') apply(); });
  } catch (e) { media = null; }
  apply();
}

export function currentThemeMode() {
  return mode;
}

/** Смена режима: применяется сразу и запоминается на этом устройстве. */
export function changeThemeMode(next) {
  mode = sanitizeThemeMode(next);
  setThemeMode(mode);
  apply();
  return mode;
}
