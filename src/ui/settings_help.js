// src/ui/settings_help.js — пояснения к настройкам партии для новичка.

import { $ } from './common.js';
import { effectiveExplain } from '../assist.js';

/** Что делает каждый режим помощи (совпадает с createAssistConfig в assist.js). */
export const ASSIST_HELP = {
  novice: 'Новичок: на вашем ходу видны шансы ставок («Расчёт»), и приложение прямо советует ход.',
  training: 'Тренировка: шансы ставок видны, но ход вы выбираете сами, без прямых советов. Подходит для обучения.',
  game: 'Игра: без шансов и подсказок, как за настоящим столом.',
};

/** Что значит каждое значение «Объяснений». */
export const EXPLAIN_HELP = {
  off: 'Объяснения выключены: за столом только шансы и подсказки режима помощи.',
  after: 'Объяснения после хода: что вы выбрали, чем это закончилось и что можно было заметить.',
  full: 'Объяснения до и после хода: перед ходом показываются факты о ситуации за столом, после хода — разбор.',
};

/** Как в режиме «Игра» объяснения работают независимо от выбора. */
export const EXPLAIN_GAME_NOTE = 'В режиме «Игра» объяснения появятся только после окончания партии.';

/** Текст под списком «Объяснения»: для «Как у режима помощи» называется, что получится на самом деле. */
export function explainHelpText(assist, explain) {
  const eff = effectiveExplain(assist, explain);
  const base = EXPLAIN_HELP[eff];
  const lead = explain === 'auto' || explain === undefined ? `Сейчас: ${{ off: 'выключены', after: 'после хода', full: 'до и после хода' }[eff]}. ` : '';
  return `${lead}${base}${assist === 'game' && eff !== 'off' ? ` ${EXPLAIN_GAME_NOTE}` : ''}`;
}

/** Подпись под списком «Режим помощи» обновляется при выборе. */
export function setupSettingsHelp() {
  const sel = $('#gAssist');
  const help = $('#gAssistHelp');
  if (!sel || !help) return;
  const update = () => { help.textContent = ASSIST_HELP[sel.value] || ''; };
  sel.addEventListener('change', update);
  update();

  const ex = $('#gExplain');
  const exHelp = $('#gExplainHelp');
  if (!ex || !exHelp) return;
  const updateExplain = () => { exHelp.textContent = explainHelpText(sel.value, ex.value); };
  sel.addEventListener('change', updateExplain);
  ex.addEventListener('change', updateExplain);
  updateExplain();
}
