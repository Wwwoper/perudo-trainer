// src/ui/welcome.js — экран приветствия на чистом профиле. Занимает весь экран, остальное приложение скрыто.
// Состояние онбординга хранится в данных устройства (поле onboarding), логика — в onboarding.js.

import { $ } from './common.js';
import { getStats, getGames, getTrainingQueue, getDeviceState, setDeviceState } from '../storage.js';
import { isEmptyStats } from '../stats_summary.js';
import { firstGamePreset } from '../game_settings.js';
import { applyGameSettings } from './game_settings_ui.js';
import { shouldShowWelcome, startGame, skipOnboarding, WELCOME } from '../onboarding.js';

const stepHtml = (s, i) =>
  `<li class="welcome-step"><span class="welcome-num" aria-hidden="true">${i + 1}</span>` +
  `<div class="welcome-body"><b>${s.title}</b><span class="muted">${s.text}</span></div></li>`;

function saveOnboarding(next) {
  setDeviceState({ ...getDeviceState(), onboarding: next });
}

function setShown(shown) {
  const box = $('#welcome');
  if (!box) return;
  box.hidden = !shown;
  document.body.toggleAttribute('data-welcome', shown);
  if (shown) $('#welcomeTitle')?.focus();
}

/** Показывает или убирает экран по текущему профилю. */
export function refreshWelcome() {
  const box = $('#welcome');
  if (!box) return;
  const dev = getDeviceState();
  const games = getGames().length;
  const empty = isEmptyStats({ stats: getStats(), games: getGames(), queue: getTrainingQueue() });
  if (!shouldShowWelcome({ state: dev.onboarding, games, empty, legacyHidden: dev.firstRunHidden })) {
    box.innerHTML = '';
    setShown(false);
    return;
  }
  box.innerHTML = `<div class="welcome-card card"><h2 class="welcome-title" id="welcomeTitle" tabindex="-1">${WELCOME.title}</h2>` +
    `<p class="welcome-lead">${WELCOME.lead}</p>` +
    `<ol class="welcome-steps">${WELCOME.steps.map(stepHtml).join('')}</ol>` +
    `<div class="welcome-actions">` +
    `<button type="button" class="btn-primary welcome-start" data-welcome="start">${WELCOME.start}</button>` +
    `<a class="welcome-rules" href="${WELCOME.rulesHref}" target="_blank" rel="noopener">${WELCOME.rules}</a>` +
    `<button type="button" class="link-btn welcome-skip" data-welcome="skip">${WELCOME.skip}</button></div>` +
    `<p class="muted welcome-note">${WELCOME.note}</p></div>`;
  setShown(true);
}

/** @param {{startGame?: () => void}} [opts] startGame — запуск партии с текущими настройками (из app_v2.js) */
export function setupWelcome({ startGame: launch } = {}) {
  const box = $('#welcome');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-welcome]');
    if (!btn) return;
    const state = getDeviceState().onboarding;
    if (btn.dataset.welcome === 'skip') {
      saveOnboarding(skipOnboarding(state));
      refreshWelcome();
      return;
    }
    if (btn.dataset.welcome === 'start') {
      saveOnboarding(startGame(state));
      applyGameSettings(firstGamePreset());
      refreshWelcome();
      $('.tab-btn[data-t="game"]')?.click();   // открывает «Партию»: до этого экран подготовки
      launch?.();                              // партия стартует сразу с настройками первой партии, без выбора параметров
    }
  });
  refreshWelcome();
}
