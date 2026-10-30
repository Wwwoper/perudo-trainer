// src/ui/situation_card.js — карточка «Картина стола» в панели «Расчёт»: факты, расчёт, предположения.
//
// Видна только на вашем ходу при объяснениях «до и после хода» и не в режиме «Игра».
// Рекомендации (шансы вариантов хода) в карточке появляются только по кнопке «Подсказка плана»:
// пока кнопка не нажата, их текста нет даже в DOM. Чужих рук карточка не знает и не показывает.
// Состояние раскрытия хранится здесь; разметку строит чистая функция situationCardHtml.

import { effectiveExplain } from '../assist.js';

/** Подписи типов строк: тип виден словом, а не только цветом. */
export const TYPE_LABELS = Object.freeze({
  fact: 'Факт',
  estimate: 'Расчёт',
  hypothesis: 'Предположение',
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Надо ли показывать карточку и кнопку «Подсказка плана».
 * @param {{assistMode: string, explain: string, active: boolean, myTurn: boolean}} s
 * @returns {boolean}
 */
export function shouldShowCard({ assistMode, explain, active, myTurn }) {
  if (!active || !myTurn) return false;
  if (assistMode === 'game') return false;
  return effectiveExplain(assistMode, explain) === 'full';
}

const TYPE_CLASS = Object.freeze({ fact: 'sit-fact', estimate: 'sit-estimate', hypothesis: 'sit-hypothesis' });

function linesHtml(lines) {
  return `<ul class="sit-lines">${lines.map((l) => `
    <li class="sit-line ${TYPE_CLASS[l.type] || 'sit-fact'}" data-line="${esc(l.id)}">
      <span class="sit-tag">${esc(TYPE_LABELS[l.type] || l.type)}</span>
      <span class="sit-text">${esc(l.text)}</span>
    </li>`).join('')}</ul>`;
}

/**
 * Разметка карточки.
 * @param {{lines: object[], plan: object[], open: boolean, planOpen: boolean}} v
 */
export function situationCardHtml({ lines, plan = [], open = false, planOpen = false }) {
  const planBlock = plan.length
    ? `<div class="sit-plan-wrap">
        <button type="button" class="sit-plan-btn" id="gPlanBtn" aria-expanded="${planOpen ? 'true' : 'false'}"${planOpen ? ' aria-controls="gPlanBody"' : ''}>${planOpen ? 'Скрыть подсказку плана' : 'Подсказка плана'}</button>
        ${planOpen ? `<div class="sit-plan" id="gPlanBody"><div class="sit-plan-title">Подсказка плана</div>${linesHtml(plan)}</div>` : ''}
      </div>`
    : '';
  return `<details class="sit-card" id="gSitCard"${open ? ' open' : ''}>
    <summary class="sit-summary"><span aria-hidden="true">🧭</span> Картина стола</summary>
    <div class="sit-body">${linesHtml(lines)}${planBlock}</div>
  </details>`;
}

let open = false;
let planKey = null;
let wired = null;

/**
 * Рисует карточку в контейнер el или очищает его.
 * @param {HTMLElement} el контейнер
 * @param {{lines: object[], plan: object[], key: string}|null} view null — карточку не показываем
 */
export function renderSituationCard(el, view) {
  if (!el) return;
  if (wired !== el) {
    wired = el;
    el.addEventListener('toggle', (e) => { if (e.target.id === 'gSitCard') open = e.target.open; }, true);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest?.('#gPlanBtn');
      if (!btn) return;
      planKey = planKey === el.dataset.key ? null : el.dataset.key;
      el.dispatchEvent(new CustomEvent('sit-plan-toggle', { bubbles: true }));
    });
  }
  if (!view) { el.innerHTML = ''; el.dataset.key = ''; return; }
  el.dataset.key = view.key;
  el.innerHTML = situationCardHtml({ lines: view.lines, plan: view.plan, open, planOpen: planKey === view.key });
}

/** Для тестов и смены партии: карточка снова свёрнута, подсказка скрыта. */
export function resetSituationCard() {
  open = false;
  planKey = null;
}
