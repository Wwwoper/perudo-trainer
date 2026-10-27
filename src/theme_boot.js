// theme_boot.js — ставит тему оформления до отрисовки страницы, чтобы не мигала неверная тема.
// Обычный (не модульный) скрипт в <head>: модули выполняются после первой отрисовки.
// Правила совпадают с src/theme.js (см. tests/theme.test.js).
function perudoBootTheme(env) {
  var DEFAULT_MODE = 'dark';
  var mode = DEFAULT_MODE;
  try {
    var raw = env.storage.getItem('perudo.settings');
    var s = raw ? JSON.parse(raw) : null;
    if (s && typeof s === 'object' && (s.theme === 'system' || s.theme === 'light' || s.theme === 'dark')) mode = s.theme;
  } catch (e) { mode = DEFAULT_MODE; }
  var theme = mode;
  if (mode === 'system') {
    theme = 'dark';
    try {
      if (env.matchMedia) theme = env.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) { theme = 'dark'; }
  }
  env.root.setAttribute('data-theme', theme);
  return theme;
}
try {
  perudoBootTheme({ storage: window.localStorage, matchMedia: window.matchMedia && window.matchMedia.bind(window), root: document.documentElement });
} catch (e) { /* без темы остаётся тёмная по умолчанию */ }
