// src/ui/series_drill_view.js — упражнение «Серия» во вкладке «Упражнения». Логика — в mixed_series.js.
// Серия живёт в пределах страницы и в хранилище не пишется.
import { $ } from './common.js';
import {
  SERIES_LENGTH, CHANCES, makeSeries, scoreSeries, seriesPrompt, stepLine, summaryLines, SERIES_NOTE, SERIES_TITLE,
} from '../mixed_series.js';

export function setupSeriesDrill() {
  const pick = $('#dDPick');
  const q = $('#dDq');
  const prog = $('#dDProgress');
  const fb = $('#dDfb');
  const bBelieve = $('#dDBelieve');
  const bDudo = $('#dDDudo');
  const bNew = $('#dDNew');
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
    prog.textContent = done() ? `Серия закончена: ${SERIES_LENGTH} из ${SERIES_LENGTH}.` : `Ситуация ${n + 1} из ${SERIES_LENGTH}.`;
    bBelieve.disabled = done();
    bDudo.disabled = done();
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
    const lines = [`<p>${stepLine(action, series.outcomes[i], series.chance)}</p>`];
    if (done()) {
      const sum = summaryLines(scoreSeries(series, choices), series.outcomes.length);
      lines.push(`<div class="series-summary"><b>${SERIES_TITLE}</b><ul class="read-lines">${sum.map((l) => `<li>${l}</li>`).join('')}</ul></div>`);
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
