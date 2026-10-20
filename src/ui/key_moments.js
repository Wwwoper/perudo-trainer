// src/ui/key_moments.js — блок «Ключевые моменты» в итоге партии и кнопка «Добавить в очередь повторов».

import { compareOptions, markChosen } from '../compare.js';
import { getClassification } from '../assist.js';
import { isReplayable, toQueueItem, weakestTag, isQueued, addToQueue } from '../moments.js';
import { getTrainingQueue, setTrainingQueue } from '../storage.js';
import { renderBid, escapeHtml } from '../table.js';
import { P, $, pct } from './common.js';
import { optionsHtml } from './options_view.js';

const THRESHOLD = 0.5;    // с этим порогом оценивается решение в партии (см. getClassification)

/** Что вы сделали в этот момент, одной фразой. */
function describe(m) {
  if (m.kind === 'raise') {
    return `Вы поставили ${renderBid(m.played.q, m.played.f)} — шанс ${pct(m.p)}` +
      (m.bid ? '.' : ' (первый ход в раунде).');
  }
  if (m.kind === 'dudo') return `Вы не поверили ${renderBid(m.bid.q, m.bid.f)} — шанс, что ставка верна: ${pct(m.p)}.`;
  return `Вы сказали Calza на ${renderBid(m.bid.q, m.bid.f)} — шанс точного совпадения ${pct(m.p)}.`;
}

const QUEUE_LABEL = 'Добавить в очередь повторов';
const QUEUED_LABEL = 'В очереди повторов ✓';

function momentHtml(m, queue) {
  const v = getClassification(m.p, m.kind);
  const icon = v.code === 'good' ? '✓' : v.code === 'meh' ? '~' : '✗';
  const { options } = compareOptions({
    bid: m.bid, total: m.n, hand: m.h, wild: m.wild, threshold: THRESHOLD,
    probBid: (...args) => P.probBid(...args),
  });
  const choice = m.kind === 'raise' ? { type: 'raise', q: m.played.q, f: m.played.f }
    : m.kind === 'dudo' ? { type: 'dudo' } : null;
  return `<div class="key-moment ${v.code}">` +
    `<p class="key-moment-head"><b>Раунд ${m.round}</b> · ${icon} ${escapeHtml(v.label)}` +
    `${m.lostDie ? ' · вы потеряли кубик' : ''}</p>` +
    `<p>${describe(m)}</p>` +
    optionsHtml(markChosen(options, choice), THRESHOLD) +
    (isReplayable(m)
      ? `<button type="button" class="key-moment-replay" data-replay="${escapeHtml(m.id)}"${isQueued(queue, toQueueItem(m)) ? ' disabled' : ''}>` +
        `${isQueued(queue, toQueueItem(m)) ? QUEUED_LABEL : QUEUE_LABEL}</button>`
      : '') +
    `</div>`;
}

/**
 * HTML итога обучения: где больше всего ошибок и до трёх ключевых моментов.
 * @param {object[]} decisions все решения партии, moments — выбранные ключевые
 */
export function keyMomentsHtml(decisions, moments) {
  if (!P) return '';
  const weak = weakestTag(decisions);
  const summary = weak
    ? `<p class="key-moments-summary">Чаще всего ошибки в теме «${escapeHtml(weak.label)}»: ${weak.errors} из ${weak.total}.</p>`
    : '';
  if (!moments.length) return summary;
  const queue = getTrainingQueue();
  return summary + `<details class="key-moments"><summary>Ключевые моменты (${moments.length})</summary>` +
    `<p class="muted">Сравнение по шансу ставки, а не оценка выигрыша.</p>` +
    moments.map((m) => momentHtml(m, queue)).join('') + `</details>`;
}

/**
 * Кнопки «Добавить в очередь повторов» внутри итога партии. Ситуация только записывается в очередь
 * (без дублей): итог остаётся открытым, чтобы можно было добавить и другие моменты. Разбираются они
 * позже в тренажёре, где повторы подмешиваются сами.
 * @param {() => object[]} getMoments ключевые моменты текущего итога
 */
export function setupKeyMoments(getMoments) {
  $('#gResultCard')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-replay]');
    if (!btn) return;
    const m = getMoments().find((x) => x.id === btn.dataset.replay);
    const item = m && toQueueItem(m);
    if (!item) return;
    const { queue, added } = addToQueue(getTrainingQueue(), item);
    if (added) setTrainingQueue(queue);
    btn.textContent = QUEUED_LABEL;
    btn.disabled = true;
  });
}
