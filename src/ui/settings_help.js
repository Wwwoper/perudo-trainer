// src/ui/settings_help.js — пояснения к настройкам партии для новичка.

import { $ } from './common.js';

/** Что делает каждый режим помощи (совпадает с createAssistConfig в assist.js). */
export const ASSIST_HELP = {
  novice: 'Новичок: на вашем ходу видны шансы ставок («Расчёт»), и приложение прямо советует ход.',
  training: 'Тренировка: шансы ставок видны, но ход вы выбираете сами, без прямых советов. Подходит для обучения.',
  game: 'Игра: без шансов и подсказок, как за настоящим столом.',
};

/** Подпись под списком «Режим помощи» обновляется при выборе. */
export function setupSettingsHelp() {
  const sel = $('#gAssist');
  const help = $('#gAssistHelp');
  if (!sel || !help) return;
  const update = () => { help.textContent = ASSIST_HELP[sel.value] || ''; };
  sel.addEventListener('change', update);
  update();
}
