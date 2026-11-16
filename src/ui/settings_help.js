// src/ui/settings_help.js — пояснения к настройкам партии для новичка.

import { $ } from './common.js';
import { effectiveExplain } from '../assist.js';

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

/** Темп: когда ходят боты (задержки совпадают с BOT_DELAYS в bot_pace.js). */
export const PACE_HELP = {
  step: 'Бот ходит, когда вы нажмёте кнопку.',
  slow: 'Бот ходит примерно через 3 секунды.',
  normal: 'Бот ходит примерно через секунду.',
  fast: 'Бот ходит почти сразу.',
};

/** Подробность объяснений. */
export const DEPTH_HELP = {
  short: 'Главные факты о ситуации и ходе.',
  detailed: 'Ещё сравнение с другими ходами и ход ставок за раунд.',
};

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

  const pace = $('#gSpeed');
  const paceHelp = $('#gSpeedHelp');
  if (pace && paceHelp) {
    const updatePace = () => { paceHelp.textContent = PACE_HELP[pace.value] || ''; };
    pace.addEventListener('change', updatePace);
    updatePace();
  }

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
