// src/ui/onboarding_tasks.js — блок «Первые задачи» в Тренажёре: прогресс и конец онбординга.
// Пока идёт режим задач (onboarding.js, isTaskMode), Тренажёр не пишет статистику и очередь повторов.

import { $ } from './common.js';
import { getDeviceState, setDeviceState, getCloudState } from '../storage.js';
import { shouldOfferAccountChoice } from '../cloud_policy.js';
import { isTaskMode, taskDone, finishOnboarding, tasksProgress, sanitizeOnboarding, TASKS_TEXT, FINISH_TEXT } from '../onboarding.js';

/**
 * @param {{account?: {chooseGuest: () => void, login: () => void}}} [hooks] account — выбор «гость или Яндекс» на итоговом экране
 *   (объект подставляется позже, поэтому передаётся как функция-получатель)
 */
export function setupTaskBanner({ account } = {}) {
  const box = $('#obTasks');
  let was = false;
  const state = () => getDeviceState().onboarding;
  const save = (next) => setDeviceState({ ...getDeviceState(), onboarding: next });
  const active = () => isTaskMode(state());

  function render() {
    if (!box) return;
    const st = sanitizeOnboarding(state());
    const tasks = st.step === 'tasks';
    const finished = st.step === 'finish' && !st.done && !st.skipped;
    if (!tasks && !finished) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const pr = tasksProgress(st);
    box.hidden = false;
    const head = `<b class="ob-tasks-title">${finished ? FINISH_TEXT.title : TASKS_TEXT.title}</b>` +
      `<p class="muted ob-tasks-lead">${finished ? FINISH_TEXT.lead : TASKS_TEXT.lead}</p>` +
      `<progress class="ob-progress" max="${pr.total}" value="${pr.done}" aria-label="Прогресс задач">${pr.text}</progress>` +
      `<span class="ob-progress-text">${pr.text}</span>`;
    box.innerHTML = head + (finished ? finishHtml() : '');
  }

  /** Итоговый экран: в приложение (с выбором «Яндекс или гость», если он ещё не сделан) и правила. */
  function finishHtml() {
    const choose = shouldOfferAccountChoice({ account: getDeviceState().account, hasToken: !!getCloudState().token, hasResults: true });
    const go = choose
      ? `<p class="ob-choice-title"><b>${FINISH_TEXT.appChoose}</b></p><div class="ob-choice">` +
        `<div><button type="button" class="btn-primary" data-ob="login">${FINISH_TEXT.login}</button><p class="muted">${FINISH_TEXT.loginNote}</p></div>` +
        `<div><button type="button" data-ob="guest">${FINISH_TEXT.guest}</button><p class="muted">${FINISH_TEXT.guestNote}</p></div></div>`
      : `<button type="button" class="btn-primary ob-finish" data-ob="app">${FINISH_TEXT.app}</button>`;
    return go + `<a class="ob-rules" href="${FINISH_TEXT.rulesHref}" target="_blank" rel="noopener">${FINISH_TEXT.rules}</a>` +
      (choose ? `<p class="muted">${FINISH_TEXT.note}</p>` : '');
  }

  const toApp = () => $('.tab-btn[data-t="game"]')?.click();   // «основное приложение» начинается с «Партии»

  box?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-ob]')?.dataset.ob;
    if (!act) return;
    save(finishOnboarding(state()));     // сценарий закончен при любом из трёх выходов
    render();
    was = false;
    if (act === 'guest') { account?.()?.chooseGuest(); toApp(); }
    else if (act === 'app') toApp();
    else if (act === 'login') account?.()?.login();
  });

  return {
    /** Идёт ли сейчас режим задач. */
    active,
    /** Перерисовывает блок; true — режим задач только что начался (Тренажёру пора перейти на базовые настройки). */
    refresh() {
      const now = active();
      render();
      const entered = now && !was;
      was = now;
      return entered;
    },
    /** Ответ на задачу дан: счётчик растёт, после последней задачи режим задач кончается. */
    answered() {
      save(taskDone(state()));
      was = active();
      render();
    },
  };
}
