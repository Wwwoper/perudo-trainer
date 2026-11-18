// src/ui/bot_styles.js — настройки партии: число ботов и стиль каждого бота.

import { BOT_STYLES, BOT_STYLE_IDS, STYLE_RANDOM, pickBotStyles } from '../bots.js';
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
    help.innerHTML = BOT_STYLE_IDS
      .map((id) => `<li><b>${BOT_STYLES[id].icon} ${BOT_STYLES[id].name}</b> — ${BOT_STYLES[id].desc}</li>`)
      .join('')
      + '<li><b>🎲 Случайный</b> — стоит у всех по умолчанию: каждому боту выпадает любой стиль, и по номеру бота его не угадать.</li>';
  }

  // «Случайный» первым: он выбран у каждого бота, пока игрок не решит иначе
  const optionsFor = () => [
    `<option value="${STYLE_RANDOM}">🎲 Случайный</option>`,
    ...BOT_STYLE_IDS.map((id) => `<option value="${id}">${BOT_STYLES[id].icon} ${BOT_STYLES[id].name}</option>`),
  ].join('');

  const render = () => {
    const prev = [...box.querySelectorAll('select')].map((sel) => sel.value);
    const n = botCountSetting();
    let html = '';
    for (let j = 0; j < n; j++) {
      html += `<label class="bot-row"><span class="bot-name">Бот ${j + 1}</span><select id="gBotStyle${j}" data-bot-style>${optionsFor()}</select></label>`;
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
