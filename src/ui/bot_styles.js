// src/ui/bot_styles.js — настройки партии: число ботов и стиль каждого бота.

import { BOT_STYLES, BOT_STYLE_IDS, STYLE_AUTO, STYLE_RANDOM, pickBotStyles } from '../bots.js';
import { $ } from './common.js';

export function botCountSetting() {
  return Math.max(1, Math.min(5, +($('#gBots')?.value || 3)));
}

// По одному выпадающему списку на каждого бота; при смене числа ботов
// уже сделанный выбор сохраняется.
export function setupBotStyles() {
  const box = $('#gBotStyles');
  if (!box) return;

  const help = $('#gStyleHelp');
  if (help) {
    help.textContent = BOT_STYLE_IDS
      .map((id) => `${BOT_STYLES[id].icon} ${BOT_STYLES[id].name} — ${BOT_STYLES[id].desc}`)
      .join('. ') + '.';
  }

  const options = [
    `<option value="${STYLE_AUTO}">По умолчанию</option>`,
    `<option value="${STYLE_RANDOM}">🎲 Случайный</option>`,
    ...BOT_STYLE_IDS.map((id) => `<option value="${id}">${BOT_STYLES[id].icon} ${BOT_STYLES[id].name}</option>`),
  ].join('');

  const render = () => {
    const prev = [...box.querySelectorAll('select')].map((sel) => sel.value);
    const n = botCountSetting();
    let html = '';
    for (let j = 0; j < n; j++) {
      html += `<div class="field-row is-stacked"><label class="field">Бот ${j + 1}<select id="gBotStyle${j}" data-bot-style>${options}</select></label></div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('select').forEach((sel, i) => { if (prev[i]) sel.value = prev[i]; });
  };

  $('#gBots')?.addEventListener('input', render);
  $('#gBots')?.addEventListener('change', render);
  render();
}

export function chosenBotStyles(count) {
  const choices = [...document.querySelectorAll('#gBotStyles select')].map((sel) => sel.value);
  return pickBotStyles(count, choices);
}
