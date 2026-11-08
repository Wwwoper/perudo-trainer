// src/ui/onboarding_tasks.js — блок «Первые задачи» в Тренажёре: прогресс и конец онбординга.
// Пока идёт режим задач (onboarding.js, isTaskMode), Тренажёр не пишет статистику и очередь повторов.

import { $ } from './common.js';
import { getDeviceState, setDeviceState } from '../storage.js';
import { isTaskMode, taskDone, finishOnboarding, tasksProgress, sanitizeOnboarding, TASKS_TEXT } from '../onboarding.js';

export function setupTaskBanner() {
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
    box.innerHTML = `<b class="ob-tasks-title">${TASKS_TEXT.title}</b>` +
      `<p class="muted ob-tasks-lead">${tasks ? TASKS_TEXT.lead : TASKS_TEXT.done}</p>` +
      `<progress class="ob-progress" max="${pr.total}" value="${pr.done}" aria-label="Прогресс задач">${pr.text}</progress>` +
      `<span class="ob-progress-text">${pr.text}</span>` +
      (finished ? `<button type="button" class="btn-primary ob-finish" data-ob="finish">${TASKS_TEXT.finish}</button>` : '');
  }

  box?.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ob="finish"]')) return;
    save(finishOnboarding(state()));
    render();
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
