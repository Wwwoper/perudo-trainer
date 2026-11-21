// src/ui/settings_help.js — пояснения к настройкам партии для новичка.

import { $ } from './common.js';
import { effectiveExplain } from '../assist.js';
import { BOT_DELAYS } from '../bot_pace.js';

/** Что делает каждый режим помощи (совпадает с createAssistConfig в assist.js). Название режима не повторяется: оно уже в списке. */
export const ASSIST_HELP = {
  novice: 'На вашем ходу видны шансы ставок, и приложение советует ход.',
  training: 'На вашем ходу видны шансы ставок, но ход вы выбираете сами, без советов.',
  game: 'Как за настоящим столом: без шансов и подсказок.',
};

/** Что значит каждое значение «Объяснений». */
export const EXPLAIN_HELP = {
  off: 'Разбора ходов не будет: остаются только шансы и подсказки режима помощи.',
  after: 'После вашего хода: что вы выбрали, чем это закончилось и что стоило заметить.',
  full: 'Перед ходом: факты о ситуации за столом. После хода: разбор.',
};

/** Названия темпа ходов ботов. */
export const PACE_NAMES = { step: 'Пошагово', slow: 'Медленно', normal: 'Нормально', fast: 'Быстро' };

/** Секунды вида «1,1 с» из задержки в мс (задержки — те же BOT_DELAYS, что двигают ходы ботов). */
export function secondsText(ms) {
  return `${(Math.round(ms / 100) / 10).toString().replace('.', ',')} с`;
}

/** Текст кнопки темпа: «Шаг» или время хода бота, например «1,1 с». */
export function paceButtonText(speed) {
  if (speed === 'step') return 'Шаг';
  return secondsText(BOT_DELAYS[speed] ?? BOT_DELAYS.normal);
}

/** Подпись выбранного темпа: «Нормально — около 1,1 с на ход». */
export function paceCaption(speed) {
  const key = Object.hasOwn(PACE_NAMES, speed) ? speed : 'normal';
  const how = key === 'step' ? 'ход бота по кнопке' : `около ${secondsText(BOT_DELAYS[key])} на ход`;
  return `${PACE_NAMES[key]} — ${how}`;
}

/** Подробность объяснений. */
export const DEPTH_HELP = {
  short: 'Главные факты о ситуации и ходе.',
  detailed: 'Ещё сравнение с другими ходами и ход ставок за раунд.',
};

/** Короткая подпись под «Боты запоминают мою игру»; forgot — сразу после сброса. */
export function memoryHelpText(on, forgot = false) {
  if (forgot) return 'Готово: боты забыли ваши ставки.';
  return on
    ? 'Боты подстраиваются под то, как вы блефуете.'
    : 'Выключено: боты ваши ставки не запоминают, накопленное сохраняется.';
}

/** «Подробнее о памяти»: сколько ставок проверено и какая доля ложных; старые наблюдения теряют вес. */
export function memoryDetailsText(stats) {
  if (!stats.challenged) return 'Пока ни одна ваша ставка не проверена. Старые наблюдения со временем теряют вес.';
  const part = stats.challenged < 3 ? 'данных пока мало' : `ложных ≈ ${stats.bluffPct}%`;
  return `Проверено ставок: ${stats.challenged}, ${part}. Старые наблюдения теряют вес.`;
}

/** Подсказка к «Показывать стили ботов». */
export function stylesHelpText(shown) {
  return shown
    ? 'Включено: рядом с аватаром виден значок стиля бота.'
    : 'Выключено: значка стиля нет. Стили раскроются в конце партии.';
}

/** Как в режиме «Игра» объяснения работают независимо от выбора. */
export const EXPLAIN_GAME_NOTE = 'В режиме «Игра» объяснения появятся только после окончания партии.';

/** Текст под списком «Объяснения»: для «Как у режима помощи» показывается то, что получится на самом деле. */
export function explainHelpText(assist, explain) {
  const eff = effectiveExplain(assist, explain);
  return `${EXPLAIN_HELP[eff]}${assist === 'game' && eff !== 'off' ? ` ${EXPLAIN_GAME_NOTE}` : ''}`;
}

/** Подпись под списком «Режим помощи» обновляется при выборе. */
export function setupSettingsHelp() {
  const sel = $('#gAssist');
  const help = $('#gAssistHelp');
  if (!sel || !help) return;
  const update = () => { help.textContent = ASSIST_HELP[sel.value] || ''; };
  sel.addEventListener('change', update);
  update();

  const depth = $('#gExplainDepth');
  const depthHelp = $('#gDepthHelp');
  if (depth && depthHelp) {
    const updateDepth = () => { depthHelp.textContent = DEPTH_HELP[depth.value] || ''; };
    depth.addEventListener('change', updateDepth);
    updateDepth();
  }

  const ex = $('#gExplain');
  const exHelp = $('#gExplainHelp');
  if (!ex || !exHelp) return;
  const updateExplain = () => { exHelp.textContent = explainHelpText(sel.value, ex.value); };
  sel.addEventListener('change', updateExplain);
  ex.addEventListener('change', updateExplain);
  updateExplain();
}

/** Подсказка к «Показывать стили ботов» меняется вместе с переключателем. */
export function setupStylesHelp() {
  const box = $('#gShowStylesOpt');
  const info = $('#gShowStylesInfo');
  if (!box || !info) return;
  const update = () => { info.textContent = stylesHelpText(box.checked); };
  box.addEventListener('change', update);
  update();
}
