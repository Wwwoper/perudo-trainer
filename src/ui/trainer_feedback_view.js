// src/ui/trainer_feedback_view.js — разметка разбора ответа в Тренажёре: плашка и блок «Шанс при повышении».

import { renderBid } from '../table.js';
import { plainChance, RAISE_BLOCK_TITLE, FEEDBACK_NOTE, legendItems } from '../trainer_feedback.js';

/** Плашка итога: заголовок, строка про шанс и порог, при необходимости пояснение. */
export function plaqueHtml(m) {
  return `<div class="tm-plaque is-${m.tone}"><b class="tm-plaque-title">${m.title}</b>` +
    `<p>${m.line}</p>${m.extra ? `<p class="tm-plaque-extra">${m.extra}</p>` : ''}</div>`;
}

/** Блок «Шанс при повышении»: строки с числом, кубиком, процентом и категорией; ниже легенда по порогу. */
export function raiseBlockHtml(rows, threshold) {
  const list = rows.map((r) =>
    `<li class="tm-row${r.chosen ? ' is-mine' : ''}"><div class="tm-row-main">${renderBid(r.q, r.f)}` +
    `${r.chosen ? '<span class="tm-row-sel">ваш выбор</span>' : ''}</div>` +
    `<div class="tm-row-p is-${r.margin}"><b>${plainChance(r.chance)}</b><span>${r.label}</span></div></li>`).join('');
  const legend = legendItems(threshold)
    .map((i) => `<li><i class="tm-dot is-${i.margin}"></i>${i.text}</li>`).join('');
  return `<section class="fb-block"><h4 class="fb-title">${RAISE_BLOCK_TITLE}</h4>` +
    `<ul class="tm-rows">${list}</ul><ul class="tm-legend-list">${legend}</ul></section>`;
}

/** Оговорка: оценка по шансу, а не по итогу раунда. */
export function feedbackNoteHtml() {
  return `<p class="trainer-model-note quiz-hint"><span class="quiz-hint-i" aria-hidden="true">ⓘ</span><span>${FEEDBACK_NOTE}</span></p>`;
}
