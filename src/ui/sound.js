// src/ui/sound.js — звуки в игре: связь страницы (жесты игрока, настройки) с движком звука.
//
// Звук выключен по умолчанию. Браузеры разрешают воспроизведение только после жеста игрока (клик, касание,
// клавиша), поэтому AudioContext создаётся при первом таком жесте; кнопка «Начать партию» его уже обеспечивает.

import { createSoundEngine } from '../sound_engine.js';
import { sanitizeSoundMode, describeSoundMode } from '../sound_plan.js';
import { soundIconSvg } from './icons.js';
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

/** Кнопка «Звук» в настройках партии: значок и подпись показывают состояние, нажатие переключает. */
function refreshSoundControls() {
  const btn = $('#gSound');
  if (btn) {
    const on = mode !== 'off';
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('svg')?.remove();
    btn.insertAdjacentHTML('afterbegin', soundIconSvg(mode));
    const label = btn.querySelector('.sound-label');
    if (label) label.textContent = on ? 'Звук включён' : 'Звук выключен';
  }
  const help = $('#gSoundHelp');
  if (help) help.textContent = describeSoundMode(mode);
}

export function setupSoundControls() {
  $('#gSound')?.addEventListener('click', () => {
    changeSoundMode(mode === 'off' ? 'on' : 'off');
    if (mode !== 'off' && engine) { engine.unlock(); engine.cue('turn'); }    // включили — сразу слышно, что звук работает
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
