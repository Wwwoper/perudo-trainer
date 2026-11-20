// count_picker.js — выбор кнопками вместо поля ввода: число ботов (1–5), число кубиков (1–10) и темп ходов ботов.
// Настоящим хранилищем остаётся поле формы (число или список): из него читают настройки партии, сводка и сохранение.
// Поле спрятано от глаз, кнопки показывают и меняют его значение.

import { plural } from '../config_summary.js';
import { $ } from './common.js';
import { PACE_NAMES, paceButtonText, paceCaption } from './settings_help.js';

/** Целое число в пределах [min, max]; не число — запасное значение. */
export function clampCount(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || value === '' || value == null) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Построить кнопки внутри `#groupId` для поля `#inputId`.
 * @param {{inputId: string, groupId: string, min: number, max: number, fallback: number, forms: string[], label: string}} o
 */
export function setupCountPicker({ inputId, groupId, min, max, fallback, forms, label }) {
  const input = $(`#${inputId}`);
  const group = $(`#${groupId}`);
  if (!input || !group) return;
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  group.innerHTML = '';
  const buttons = [];
  for (let n = min; n <= max; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.count = String(n);
    b.textContent = String(n);
    b.setAttribute('aria-label', `${n} ${plural(n, forms)}`);
    b.addEventListener('click', () => {
      input.value = String(n);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    buttons.push(b);
    group.append(b);
  }
  const refresh = () => {
    const cur = clampCount(input.value, min, max, fallback);
    for (const b of buttons) {
      const on = Number(b.dataset.count) === cur;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  group.addEventListener('keydown', (e) => {                                 // стрелки, как у радиокнопок
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const cur = clampCount(input.value, min, max, fallback);
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, cur - min + step))];
    next.click();
    next.focus();
  });
  input.addEventListener('input', refresh);
  input.addEventListener('change', refresh);
  refresh();
}

/**
 * Кнопки-варианты для списка `#selectId` внутри `#groupId`; в подписи `#captionId` — расшифровка выбранного.
 * @param {{selectId: string, groupId: string, captionId: string, values: string[], text: (v: string) => string, caption: (v: string) => string, label: (v: string) => string, groupLabel: string}} o
 */
export function setupChoicePicker({ selectId, groupId, captionId, values, text, caption, label, groupLabel }) {
  const select = $(`#${selectId}`);
  const group = $(`#${groupId}`);
  if (!select || !group) return;
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', groupLabel);
  group.innerHTML = '';
  const buttons = values.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.value = v;
    b.textContent = text(v);
    b.setAttribute('aria-label', label(v));
    b.addEventListener('click', () => {
      select.value = v;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    group.append(b);
    return b;
  });
  const refresh = () => {
    const cur = values.includes(select.value) ? select.value : 'normal';
    for (const b of buttons) {
      const on = b.dataset.value === cur;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    const cap = $(`#${captionId}`);
    if (cap) cap.textContent = caption(cur);
  };
  group.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(0, values.indexOf(select.value));
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, i + step))];
    next.click();
    next.focus();
  });
  select.addEventListener('input', refresh);
  select.addEventListener('change', refresh);
  refresh();
}

export function setupCountPickers() {
  setupChoicePicker({
    selectId: 'gSpeed', groupId: 'gSpeedPick', captionId: 'gSpeedNow',
    values: Object.keys(PACE_NAMES), text: paceButtonText, caption: paceCaption,
    label: (v) => `${PACE_NAMES[v]}: ${paceCaption(v).split(' — ')[1]}`, groupLabel: 'Темп ходов ботов',
  });
  setupCountPicker({ inputId: 'gBots', groupId: 'gBotsPick', min: 1, max: 5, fallback: 3, forms: ['бот', 'бота', 'ботов'], label: 'Количество ботов' });
  setupCountPicker({ inputId: 'gDice', groupId: 'gDicePick', min: 1, max: 10, fallback: 5, forms: ['кубик', 'кубика', 'кубиков'], label: 'Количество кубиков у каждого игрока в начале партии' });
}
