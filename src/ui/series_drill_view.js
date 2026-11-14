// src/ui/series_drill_view.js — упражнение «Серия» во вкладке «Упражнения». Логика — в mixed_series.js.
// Серия живёт в пределах страницы и в хранилище не пишется.
import { $ } from './common.js';
import {
  SERIES_LENGTH, CHANCES, makeSeries, scoreSeries, seriesPrompt, stepParts, progressMarks, summaryLines, summaryFacts, SERIES_NOTE, SERIES_TITLE,
} from '../mixed_series.js';

export function setupSeriesDrill() {
  const pick = $('#dDPick');
  const q = $('#dDq');
  const prog = $('#dDProgress');
  const fb = $('#dDfb');
  const bBelieve = $('#dDBelieve');
  const bDudo = $('#dDDudo');
  const bNew = $('#dDNew');
  const decide = bBelieve?.parentElement;   // блок кнопок решений
  if (!pick || !q || !prog || !fb || !bBelieve || !bDudo || !bNew) return null;

  let chance = CHANCES[0];
  let series = null;
  let choices = [];

  pick.innerHTML = CHANCES.map((p) =>
    `<button type="button" class="series-chance" data-chance="${p}" aria-pressed="false">${Math.round(p * 100)} %</button>`).join('');

  const done = () => !series || choices.length >= series.outcomes.length;

  function draw() {
    pick.querySelectorAll('.series-chance').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.chance) === chance)));
    q.textContent = seriesPrompt(chance);
    const n = choices.length;
    const label = done() ? `Серия закончена: ${SERIES_LENGTH} из ${SERIES_LENGTH}.` : `Ситуация ${n + 1} из ${SERIES_LENGTH}.`;
    const dots = progressMarks(series, choices).map((m) => `<span class="series-dot is-${m}">${m === 'ok' ? '✓' : m === 'miss' ? '✗' : ''}</span>`).join('');
    prog.innerHTML = `<span class="series-dots" aria-hidden="true">${dots}</span><span class="series-count">${label}</span>`;
    bBelieve.disabled = done();
    bDudo.disabled = done();
    // После десятой ситуации решать больше нечего: кнопки уходят, остаётся итог и «Ещё одна серия»
    if (decide) decide.hidden = done();
    bNew.classList.toggle('btn-primary', done() && choices.length > 0);
    bNew.textContent = done() && choices.length > 0 ? 'Ещё одна серия' : 'Новая серия';
  }

  function start(p = chance) {
    chance = p;
    series = makeSeries({ chance });
    choices = [];
    fb.innerHTML = '';
    draw();
  }

  function answer(action) {
    if (done()) return;
    const i = choices.length;
    choices.push(action);
    const t = stepParts(action, series.outcomes[i], series.chance);
    const lines = [`<div class="series-ans is-${t.ok ? 'ok' : 'miss'}"><p class="series-ans-head"><span aria-hidden="true">${t.ok ? '✓' : '✗'}</span> ${t.verdict}</p><p class="series-ans-fact">${t.fact}</p><p class="muted series-ans-note">${t.note}</p></div>`];
    if (done()) {
      const sc = scoreSeries(series, choices);
      const [main, ...rest] = summaryLines(sc, series.outcomes.length);
      lines.push(`<div class="series-summary"><b>${SERIES_TITLE}</b><p class="series-score">${main}</p>${rest.map((l) => `<p>${l}</p>`).join('')}<p class="muted">${summaryFacts(sc)}</p></div>`);
      lines.push(`<p class="muted">${SERIES_NOTE}</p>`);
    }
    fb.innerHTML = lines.join('');
    draw();
  }

  pick.addEventListener('click', (e) => {
    const b = e.target.closest('.series-chance');
    if (b) start(Number(b.dataset.chance));
  });
  bBelieve.addEventListener('click', () => answer('believe'));
  bDudo.addEventListener('click', () => answer('dudo'));
  bNew.addEventListener('click', () => start());
  start();

  return { show() { if (!series) start(); else draw(); } };
}
