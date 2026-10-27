// theme.js — выбор темы оформления (чистая логика, без DOM и localStorage).
//
// Режим темы: 'system' (как в системе), 'light' (светлая), 'dark' (тёмная).
// Фактическая тема, которую видит игрок, всегда 'light' или 'dark': её определяет resolveTheme().
// Тот же выбор делает src/theme_boot.js до отрисовки страницы (см. tests/theme.test.js: правила совпадают).

export const THEME_MODES = Object.freeze(['system', 'light', 'dark']);
export const THEMES = Object.freeze(['light', 'dark']);

/** Режим по умолчанию, пока у игрока нет сохранённого выбора. */
export const DEFAULT_THEME_MODE = 'dark';

export const THEME_LABELS = Object.freeze({ system: 'Системная', light: 'Светлая', dark: 'Тёмная' });

/** Любое значение из хранилища → допустимый режим (мусор заменяется режимом по умолчанию). */
export function sanitizeThemeMode(v) {
  return THEME_MODES.includes(v) ? v : DEFAULT_THEME_MODE;
}

/**
 * Фактическая тема.
 * @param {string} mode режим (любое значение)
 * @param {boolean|null|undefined} systemPrefersDark система просит тёмную тему; null/undefined — система не сообщает
 */
export function resolveTheme(mode, systemPrefersDark) {
  const m = sanitizeThemeMode(mode);
  if (m === 'light' || m === 'dark') return m;
  if (systemPrefersDark === true) return 'dark';
  if (systemPrefersDark === false) return 'light';
  return 'dark';        // система не сообщает предпочтение
}
