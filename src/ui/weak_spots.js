// src/ui/weak_spots.js — блок «Над чем поработать» во вкладке «Статистика».

import { weakSpots, MIN_DECISIONS } from '../weak_spots.js';
import { escapeHtml } from '../table.js';
import { $, pct } from './common.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** HTML блока по счётчикам byTag из профиля. */
export function weakSpotsHtml(byTag) {
  const { weak, pending } = weakSpots(byTag);
  let h = '<b>Над чем поработать</b>' +
    `<p class="muted">Доля решений, где шанс ставки был выше порога, по темам. Темы, где решений меньше ${MIN_DECISIONS}, пока не оцениваются.</p>`;
  if (!weak.length) {
    h += pending.length || Object.keys(byTag || {}).length
      ? '<p class="weak-empty">Слабых мест пока не видно: сыграйте ещё партию, чтобы набрать решения.</p>'
      : '<p class="weak-empty">Здесь появятся темы, где вы чаще ошибаетесь, после нескольких партий.</p>';
  } else {
    h += '<ul class="weak-list">' + weak.map((w) =>
      `<li class="weak-item"><span class="weak-name">${escapeHtml(cap(w.label))}</span>` +
      `<span class="weak-share">${pct(w.share)} · ${w.n} реш.</span>` +
      (w.mode ? `<button type="button" class="weak-train" data-train="${w.mode}">Тренировать</button>` : '') +
      `</li>`).join('') + '</ul>';
  }
  if (pending.length) {
    h += '<p class="muted weak-pending">Пока мало данных: ' +
      pending.map((p) => `${escapeHtml(p.label)} (${p.n})`).join(', ') + '.</p>';
  }
  return h;
}

/** Рисует блок и обрабатывает «Тренировать». */
export function renderWeakSpots(byTag) {
  const el = $('#stWeak');
  if (el) el.innerHTML = weakSpotsHtml(byTag);
}

export function setupWeakSpots(onTrain) {
  $('#stWeak')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-train]');
    if (btn) onTrain?.(btn.dataset.train);
  });
}
