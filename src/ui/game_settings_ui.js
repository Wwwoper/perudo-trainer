// src/ui/game_settings_ui.js — запоминание настроек последней партии в форме «Новая партия».
//
// Читает поля формы, при старте партии сохраняет их, при загрузке страницы возвращает на место.
// Правила проверки данных — в game_settings.js, хранение — в storage.js.

import { $ } from './common.js';
import {
  sanitizeGameSettings, defaultGameSettings, isDefaultGameSettings,
} from '../game_settings.js';
import { getLastGameSettings, setLastGameSettings, clearLastGameSettings } from '../storage.js';

const num = (id, fallback) => $(id)?.value ?? fallback;

/** Текущие значения полей формы, приведённые к допустимому виду. */
export function readGameSettings() {
  return sanitizeGameSettings({
    dice: num('#gDice', 5),
    bots: num('#gBots', 3),
    botStyles: [...document.querySelectorAll('#gBotStyles select')].map((sel) => sel.value),
    botLevel: num('#gBotLevel', 'normal'),
    memory: $('#gMemoryOpt') ? $('#gMemoryOpt').checked : true,
    assist: num('#gAssist', 'training'),
    speed: num('#gSpeed', 'normal'),
    calza: !!$('#gCalzaOpt')?.checked,
    palifico: !!$('#gPalificoOpt')?.checked,
    reveal: $('#gRevealOpt') ? $('#gRevealOpt').checked : true,
    explain: num('#gExplain', 'auto'),
    explainDepth: num('#gExplainDepth', 'short'),
    hideStyles: $('#gShowStylesOpt') ? !$('#gShowStylesOpt').checked : defaultGameSettings().hideStyles,
  });
}

function fire(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = String(value);
  fire(el, 'change');
}

function setChecked(id, value) {
  const el = $(id);
  if (!el) return;
  el.checked = !!value;
  fire(el, 'change');
}

/**
 * Записывает настройки в поля формы. Сначала число ботов (оно перестраивает список стилей),
 * потом стили; события «change» нужны сводке «Сейчас: …» и пояснению к режиму помощи.
 */
export function applyGameSettings(raw) {
  const s = sanitizeGameSettings(raw);
  setValue('#gDice', s.dice);
  setValue('#gBots', s.bots);
  document.querySelectorAll('#gBotStyles select').forEach((sel, i) => {
    sel.value = s.botStyles[i] || 'auto';
    if (sel.value !== (s.botStyles[i] || 'auto')) sel.value = 'auto';
  });
  setValue('#gBotLevel', s.botLevel);
  setChecked('#gMemoryOpt', s.memory);
  setValue('#gAssist', s.assist);
  setValue('#gSpeed', s.speed);
  setChecked('#gCalzaOpt', s.calza);
  setChecked('#gPalificoOpt', s.palifico);
  setChecked('#gRevealOpt', s.reveal);
  setValue('#gExplain', s.explain);
  setValue('#gExplainDepth', s.explainDepth);
  setChecked('#gShowStylesOpt', !s.hideStyles);
}

/** Запомнить то, с чем начинается партия. */
export function rememberGameSettings() {
  setLastGameSettings(readGameSettings());
  refreshResetButton();
}

function refreshResetButton() {
  const btn = $('#gSettingsReset');
  if (btn) btn.hidden = isDefaultGameSettings(readGameSettings());
}

/** Подстановка сохранённых настроек при загрузке и кнопка «Сбросить к стандартным». */
export function setupGameSettings() {
  const saved = getLastGameSettings();
  if (saved) applyGameSettings(saved);

  const btn = $('#gSettingsReset');
  if (btn) {
    btn.addEventListener('click', () => {
      applyGameSettings(defaultGameSettings());
      clearLastGameSettings();
      refreshResetButton();
    });
  }
  const panel = $('#panSettings');
  if (panel) {
    panel.addEventListener('change', refreshResetButton);
    panel.addEventListener('input', refreshResetButton);
  }
  refreshResetButton();
}
