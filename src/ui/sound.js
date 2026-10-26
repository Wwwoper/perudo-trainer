// src/ui/sound.js — звуки в игре: связь страницы (жесты игрока, настройки) с движком звука.
//
// Звук выключен по умолчанию. Браузеры разрешают воспроизведение только после жеста игрока (клик, касание,
// клавиша), поэтому AudioContext создаётся при первом таком жесте; кнопка «Начать партию» его уже обеспечивает.

import { createSoundEngine } from '../sound_engine.js';
import { sanitizeSoundMode, describeSoundMode } from '../sound_plan.js';
import { $ } from './common.js';
import { getSoundMode, setSoundMode } from '../storage.js';

let engine = null;
let mode = 'off';

/** @param {{getSpeed: () => string}} opts */
export function setupSound({ getSpeed }) {
  mode = getSoundMode();
  engine = createSoundEngine({
    AudioContextCtor: window.AudioContext || window.webkitAudioContext || null,
    getMode: () => mode,
    getSpeed,
  });
  const unlock = () => { if (mode !== 'off') engine.unlock(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) {
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  }
}

/** Событие игры: см. CUES в sound_plan.js (turn, dudo, calza, loseDie, win, lose, deal, illegal, bidYou, bidBot). */
export function playCue(event) {
  if (engine) engine.cue(event);
}

/** Новая или восстановленная партия: очередь звуков очищается. */
export function resetSound() {
  if (engine) engine.reset();
}

export function currentSoundMode() {
  return mode;
}

/** Переключатель «Звуки» в настройках партии: показывает режим, меняет его, кнопка «Проверить звук». */
function refreshSoundControls() {
  const sel = $('#gSound');
  if (sel && sel.value !== mode) sel.value = mode;
  const help = $('#gSoundHelp');
  if (help) help.textContent = describeSoundMode(mode);
  const test = $('#gSoundTest');
  if (test) test.hidden = mode === 'off';
}

export function setupSoundControls() {
  $('#gSound')?.addEventListener('change', (e) => {
    changeSoundMode(e.target.value);
    if (mode !== 'off' && engine) { engine.unlock(); engine.cue('turn'); }     // выбор режима — сразу слышно, как он звучит
  });
  $('#gSoundTest')?.addEventListener('click', () => {
    if (!engine) return;
    engine.unlock();                                                          // клик — жест игрока: звук разрешён
    engine.reset();
    engine.cue('turn');
  });
  refreshSoundControls();
}

/** Смена режима: запоминается на этом устройстве. Новый режим «не выкл» звучит после ближайшего жеста игрока. */
export function changeSoundMode(next) {
  mode = sanitizeSoundMode(next);
  setSoundMode(mode);
  if (engine) engine.reset();
  refreshSoundControls();
  return mode;
}
