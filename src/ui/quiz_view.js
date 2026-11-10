// src/ui/quiz_view.js — викторина «Читай стол» во вкладке «Упражнения».
//
// Логика серии — в quiz_series.js, тексты — в quiz_text.js. Здесь только экран: чужие руки в страницу
// не попадают (показываются ваши кубики, число кубиков у соперников и ход ставок).
// Серия живёт в пределах страницы и в хранилище не пишется.

import { getRounds } from '../storage.js';
import { renderBid, renderHand, escapeHtml } from '../table.js';
import { seatLabel as rawSeatLabel } from '../read_drill.js';
import { PER_TABLE } from '../table_quiz.js';
import { createSeries, currentQuestion, progress, submitAnswer, summarize } from '../quiz_series.js';
import { progressLabel, resultLine, endLine, pointsText } from '../quiz_text.js';
import { $ } from './common.js';

const label = (round, seat) => escapeHtml(rawSeatLabel(round, seat));

export function setupQuizDrill() {
  const startBox = $('#dEStart');
  const play = $('#dEPlay');
  const endBox = $('#dEEnd');
  const goBtn = $('#dEGo');
  const progEl = $('#dEProgress');
  const pointsEl = $('#dEPoints');
  const scene = $('#dEScene');
  const ask = $('#dEAsk');
  const fb = $('#dEFb');
  const nextBtn = $('#dENext');
  const endText = $('#dEEndText');
  const againBtn = $('#dEAgain');
  if (!startBox || !play || !endBox || !goBtn || !progEl || !pointsEl || !scene || !ask || !fb || !nextBtn || !endText || !againBtn) return null;

  let series = null;
  let answered = false;
  let num = 0;

  const screen = (name) => {
    startBox.classList.toggle('hide', name !== 'start');
    play.classList.toggle('hide', name !== 'play');
    endBox.classList.toggle('hide', name !== 'end');
  };

  /** Ваши кубики, число кубиков у соперников и ход ставок; чужих рук здесь нет. */
  function sceneHtml(round) {
    const sizes = round.dice.map((d, i) => `${label(round, i)} — ${d}`).join(' · ');
    const rows = round.bids.map((b, i) =>
      `<li class="read-bid${b.s === round.me ? ' is-me' : ''}"><span class="read-bid-n">${i + 1}</span>` +
      `<span class="read-bid-who">${label(round, b.s)}</span>${renderBid(b.q, b.f)}</li>`).join('');
    const end = round.end?.kind === 'dudo'
      ? `<li class="read-bid"><span class="read-bid-n">${round.bids.length + 1}</span><span class="read-bid-who">${label(round, round.end.by)}</span><b>Не верю</b></li>`
      : '';
    return `<p>Ваши кубики: ${renderHand(round.hands[round.me], round.wild)}<br>` +
      `Кубиков в руках: <b>${sizes}</b>.<br>` +
      (round.wild ? 'Единицы — джокеры: считаются за любую цифру.' : 'Единицы обычные: за другие цифры не считаются (раунд Палифико).') +
      `</p><ol class="read-bids" aria-label="Ставки раунда по порядку">${rows}${end}</ol>`;
  }

  function askHtml(q) {
    const title = `<p class="quiz-q">${escapeHtml(q.title)}</p>`;
    if (q.input === 'number') {
      return `${title}<div class="quiz-step"><button type="button" class="quiz-minus" aria-label="Меньше">−</button>` +
        `<output id="dENum" class="quiz-num" aria-live="polite">${num}</output>` +
        `<button type="button" class="quiz-plus" aria-label="Больше">+</button></div>` +
        '<button type="button" class="btn-primary quiz-send"><span class="btn-main">Ответить</span></button>';
    }
    return `${title}<div class="quiz-opts" role="group" aria-label="Ваш ответ">` +
      q.options.map((o) => `<button type="button" class="quiz-opt" data-v="${escapeHtml(o.v)}">${escapeHtml(o.label)}</button>`).join('') +
      '</div>';
  }

  function render() {
    const cur = currentQuestion(series);
    if (!cur) { finish(); return; }
    answered = false;
    screen('play');
    const p = progress(series);
    progEl.textContent = progressLabel(p, series.tables.length, PER_TABLE);
    pointsEl.textContent = `Баллы: ${series.results.reduce((a, r) => a + r.points, 0)}`;
    scene.innerHTML = sceneHtml(cur.round);
    const q = cur.question;
    if (q.input === 'number') num = Math.max(q.range.min, Math.min(q.range.max, q.start));
    ask.innerHTML = askHtml(q);
    fb.innerHTML = '';
    nextBtn.classList.add('hide');
  }

  function finish() {
    const sum = summarize(series);
    screen('end');
    endText.textContent = endLine(sum);
  }

  function answer(value) {
    if (answered) return;
    const cur = currentQuestion(series);
    if (!cur) return;
    answered = true;
    const out = submitAnswer(series, value);
    series = out.series;
    const q = cur.question;
    const verdict = resultLine(out.result);
    ask.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (q.input !== 'number') ask.querySelector(`.quiz-opt[data-v="${CSS.escape(q.answer)}"]`)?.classList.add('is-right');
    fb.innerHTML = `<p class="quiz-verdict is-${verdict.tone}">${escapeHtml(verdict.text)}</p><p class="muted">${escapeHtml(q.explain)}</p>`;
    pointsEl.textContent = `Баллы: ${series.results.reduce((a, r) => a + r.points, 0)}`;
    nextBtn.querySelector('.btn-main').textContent = progress(series).done ? 'Итог' : 'Дальше';
    nextBtn.classList.remove('hide');
  }

  ask.addEventListener('click', (e) => {
    if (answered) return;
    const cur = currentQuestion(series);
    if (!cur) return;
    const opt = e.target.closest('.quiz-opt');
    if (opt) { answer(opt.dataset.v); return; }
    const q = cur.question;
    if (e.target.closest('.quiz-minus')) num = Math.max(q.range.min, num - 1);
    else if (e.target.closest('.quiz-plus')) num = Math.min(q.range.max, num + 1);
    else if (e.target.closest('.quiz-send')) { answer(num); return; }
    else return;
    const out = $('#dENum');
    if (out) out.textContent = String(num);
  });

  nextBtn.onclick = () => render();

  function start() {
    series = createSeries({ rounds: getRounds() });
    if (!series.tables.length) { screen('start'); return; }
    render();
  }

  goBtn.onclick = start;
  againBtn.onclick = start;

  return {
    /** Открытие вкладки: незаконченная серия продолжается, иначе показывается старт. */
    show() { if (!series) screen('start'); },
    pointsText,
  };
}
