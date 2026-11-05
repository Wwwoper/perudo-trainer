// src/ui/next_step.js — блок «Что дальше» во вкладке «Статистика».

import { nextStep, NEXT_TITLE } from '../next_step.js';
import { escapeHtml } from '../table.js';
import { $ } from './common.js';

/** HTML блока: заголовок, одна рекомендация и кнопка действия. */
export function nextStepHtml(src) {
  const n = nextStep(src);
  const attr = n.action.train ? `data-next-train="${n.action.train}"` : `data-next-tab="${n.action.tab}"`;
  return `<b>${NEXT_TITLE}</b><p class="next-text">${escapeHtml(n.text)}</p>` +
    `<button type="button" class="next-act" ${attr}>${escapeHtml(n.action.label)}</button>`;
}

export function renderNextStep(src) {
  const el = $('#stNext');
  if (el) el.innerHTML = nextStepHtml(src);
}

/** onTrain(mode) — как у «Над чем поработать». */
export function setupNextStep(onTrain) {
  $('#stNext')?.addEventListener('click', (e) => {
    const train = e.target.closest('[data-next-train]')?.dataset.nextTrain;
    if (train) { onTrain?.(train); return; }
    const tab = e.target.closest('[data-next-tab]')?.dataset.nextTab;
    if (tab) $(`.tab-btn[data-t="${tab}"]`)?.click();
  });
}
