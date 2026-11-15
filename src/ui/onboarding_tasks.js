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

  /** Задачи кончились, а «Завершить знакомство» ещё не нажато. */
  const finishPending = () => { const st = sanitizeOnboarding(state()); return st.step === 'finish' && !st.done && !st.skipped; };

  /** compact — сразу после последнего ответа: кнопка завершения живёт в Тренажёре («Завершить знакомство» вместо «Новой ситуации»), блок не растёт. */
  function render({ compact = false } = {}) {
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
    // Блок одинаковой высоты и до, и после последней задачи: стол под ним не сдвигается
    box.innerHTML = `<b class="ob-tasks-title">${TASKS_TEXT.title}</b>` +
      `<p class="muted ob-tasks-lead">${TASKS_TEXT.lead}</p>` +
      `<progress class="ob-progress" max="${pr.total}" value="${pr.done}" aria-label="Прогресс задач">${pr.text}</progress>` +
      `<span class="ob-progress-text">${pr.text}</span>` +
      (finished && !compact ? `<button type="button" class="btn-primary ob-finish" data-ob="finish">${FINISH_TEXT.finishButton}</button>` : '');
  }

  const toApp = () => $('.tab-btn[data-t="game"]')?.click();   // «основное приложение» начинается с «Партии»

  /** Окно, которым заканчивается знакомство: выбор «Яндекс или гость» (если он ещё не сделан) и ссылка на правила. */
  function openFinish() {
    if (!finishPending()) return;
    const choose = shouldOfferAccountChoice({ account: getDeviceState().account, hasToken: !!getCloudState().token, hasResults: true });
    $('#obFinishDialog')?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'obFinishDialog';
    dlg.className = 'ob-finish-dialog';
    dlg.setAttribute('aria-labelledby', 'obFinishTitle');
    const card = (btn, cls, note) => `<div class="ob-card"><button type="button" class="${cls}" data-ob="${btn.act}">${btn.text}</button><p class="muted">${note}</p></div>`;
    dlg.innerHTML = `<div class="ob-finish-body"><h2 id="obFinishTitle" class="ob-finish-title">${FINISH_TEXT.title}</h2>` +
      `<p class="ob-finish-lead">${FINISH_TEXT.lead}</p>` +
      (choose
        ? `<p class="ob-finish-q"><b>${FINISH_TEXT.chooseTitle}</b></p><div class="ob-cards">` +
          card({ act: 'login', text: FINISH_TEXT.login }, 'btn-primary', FINISH_TEXT.loginNote) +
          card({ act: 'guest', text: FINISH_TEXT.guest }, '', FINISH_TEXT.guestNote) + '</div>'
        : `<button type="button" class="btn-primary ob-app" data-ob="app">${FINISH_TEXT.app}</button>`) +
      (choose ? `<p class="muted ob-finish-note">${FINISH_TEXT.note}</p>` : '') +
      `<a class="ob-rules" href="${FINISH_TEXT.rulesHref}" target="_blank" rel="noopener">${FINISH_TEXT.rules}</a></div>`;
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { dlg.close(); return; }     // клик по подложке: закрыть, знакомство остаётся незавершённым
      const act = e.target.closest('[data-ob]')?.dataset.ob;
      if (act) choice(act, dlg);
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    dlg.querySelector('button')?.focus();
  }

  /** Выбор в окне завершения: сценарий закончен при любом из выходов. */
  function choice(act, dlg) {
    save(finishOnboarding(state()));
    dlg?.close();
    render();
    was = false;
    if (act === 'guest') { account?.()?.chooseGuest(); toApp(); }
    else if (act === 'app') toApp();
    else if (act === 'login') account?.()?.login();
  }

  box?.addEventListener('click', (e) => {
    if (e.target.closest('[data-ob="finish"]')) openFinish();
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
      render({ compact: true });
    },
    /** Задачи кончились, но знакомство ещё не завершено: «Новая ситуация» в Тренажёре превращается в «Завершить знакомство». */
    finishPending,
    /** Открывает окно завершения знакомства. */
    openFinish,
  };
}
