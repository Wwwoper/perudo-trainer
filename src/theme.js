// theme.js — выбор темы оформления (чистая логика, без DOM и localStorage).
//
// Режим темы: 'system' (как в системе), 'light' (светлая), 'dark' (тёмная).
// Фактическая тема, которую видит игрок, всегда 'light' или 'dark': её определяет resolveTheme().
// Тот же выбор делает src/theme_boot.js до отрисовки страницы (см. tests/theme.test.js: правила совпадают).

export const THEME_MODES = Object.freeze(['system', 'light', 'dark']);
export const THEMES = Object.freeze(['light', 'dark']);

/** Режим по умолчанию, пока у игрока нет сохранённого выбора. */
export const DEFAULT_THEME_MODE = 'light';

export const THEME_LABELS = Object.freeze({ system: 'Системная', light: 'Светлая', dark: 'Тёмная' });

/** Пояснение под выбором темы: что действует сейчас. */
export function describeThemeMode(mode, systemPrefersDark) {
  const m = sanitizeThemeMode(mode);
  if (m === 'light') return 'Светлая тема действует всегда.';
  if (m === 'dark') return 'Тёмная тема действует всегда.';
  if (systemPrefersDark === true) return 'Сейчас по настройке устройства действует тёмная тема.';
  if (systemPrefersDark === false) return 'Сейчас по настройке устройства действует светлая тема.';
  return 'Устройство не сообщает, какая тема включена, поэтому действует светлая.';
}

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
  return 'light';       // система не сообщает предпочтение: как по умолчанию
}
