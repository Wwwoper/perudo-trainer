// src/ui/practice_timer.js — необязательный таймер: флажок + «м:сс» рядом с задачей. Время нигде не учитывается.
import { getSettings, setSettings } from '../storage.js';
import { $ } from './common.js';
import { createStopwatch, formatElapsed, sanitizeTimerPref } from '../practice_timer.js';

/**
 * @param {{toggle: string, out: string}} sel селекторы флажка и поля времени
 * @returns {{start: () => void, stop: () => void}} start — задача показана, stop — ответ дан
 */
export function setupPracticeTimer({ toggle, out }) {
  const box = $(toggle);
  const output = $(out);
  const sw = createStopwatch();
  let tick = null;
  const enabled = () => !!box && box.checked;

  const draw = () => { if (output) output.textContent = formatElapsed(sw.elapsed()); };
  const halt = () => { if (tick !== null) { clearInterval(tick); tick = null; } };
  const run = () => { halt(); if (enabled() && sw.running()) tick = setInterval(draw, 1000); };
  const show = () => { if (output) output.hidden = !enabled(); draw(); };

  if (box) {
    box.checked = sanitizeTimerPref(getSettings().practiceTimer);
    box.addEventListener('change', () => {
      setSettings({ practiceTimer: box.checked });
      show();
      run();
    });
  }
  show();

  return {
    start() { sw.start(); show(); run(); },
    stop() { sw.stop(); halt(); draw(); },
  };
}
