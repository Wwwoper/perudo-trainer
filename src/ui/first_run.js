// src/ui/first_run.js — карточка «Впервые здесь?» в начале Калькулятора.
// Видна только на чистом профиле; её можно скрыть (флаг хранится на устройстве, в копию не входит).

import { $ } from './common.js';
import { getStats, getGames, getTrainingQueue, getDeviceState, setDeviceState } from '../storage.js';
import { isEmptyStats } from '../stats_summary.js';
import { firstGamePreset } from '../game_settings.js';
import { applyGameSettings } from './game_settings_ui.js';
import {
  FIRST_RUN_TITLE, FIRST_RUN_LEAD, FIRST_RUN_HIDE, FIRST_RUN_STEPS, shouldShowFirstRun,
} from '../first_run.js';

function stepHtml(s, i) {
  const act = s.kind === 'link'
    ? `<a class="first-run-act" href="${s.href}" target="_blank" rel="noopener">${s.action}</a>`
    : `<button type="button" class="first-run-act" data-first-run="${s.id}">${s.action}</button>`;
  return `<li class="first-run-step"><span class="first-run-num" aria-hidden="true">${i + 1}</span>` +
    `<div class="first-run-body"><b>${s.title}</b><span class="muted">${s.text}</span></div>${act}</li>`;
}

/** Перерисовывает карточку по текущему профилю: показывает или убирает. */
export function refreshFirstRun() {
  const box = $('#firstRun');
  if (!box) return;
  const empty = isEmptyStats({ stats: getStats(), games: getGames(), queue: getTrainingQueue() });
  if (!shouldShowFirstRun({ empty, hidden: getDeviceState().firstRunHidden })) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h3 class="first-run-title" id="firstRunTitle">${FIRST_RUN_TITLE}</h3>` +
    `<p class="muted first-run-lead">${FIRST_RUN_LEAD}</p>` +
    `<ol class="first-run-steps">${FIRST_RUN_STEPS.map(stepHtml).join('')}</ol>` +
    `<button type="button" class="link-btn" data-first-run-hide>${FIRST_RUN_HIDE}</button>`;
}

export function setupFirstRun() {
  const box = $('#firstRun');
  if (!box) return;
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-first-run-hide]')) {
      setDeviceState({ ...getDeviceState(), firstRunHidden: true });
      refreshFirstRun();
      return;
    }
    const btn = e.target.closest('[data-first-run]');
    if (!btn) return;
    const step = FIRST_RUN_STEPS.find((s) => s.id === btn.dataset.firstRun);
    if (!step) return;
    if (step.kind === 'preset') applyGameSettings(firstGamePreset());
    $(`.tab-btn[data-t="${step.tab}"]`)?.click();
  });
  refreshFirstRun();
}
