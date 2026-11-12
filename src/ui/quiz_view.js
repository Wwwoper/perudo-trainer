// src/ui/quiz_view.js — викторина «Читай стол» во вкладке «Упражнения».
//
// Логика серии — в quiz_series.js, тексты — в quiz_text.js. Здесь только экран: чужие руки в страницу
// не попадают (показываются ваши кубики, число кубиков у соперников и ход ставок).
// Серия живёт в пределах страницы и в хранилище не пишется.

import { getRounds, getStats, updateStats } from '../storage.js';
import { renderBid, renderHand, renderDie, renderHiddenDice, escapeHtml } from '../table.js';
import { seatLabel as rawSeatLabel } from '../read_drill.js';
import { PER_TABLE } from '../table_quiz.js';
import {
  createSeries, currentQuestion, progress, submitAnswer, summarize, pointsBeforeTable, totalPoints, totalQuestions,
} from '../quiz_series.js';
import { progressLabel, resultLine, summaryView, splitDice, verdictMark } from '../quiz_text.js';
import { addQuizResults, lastSeriesRecord, lastSeriesText } from '../quiz_stats.js';
import { $ } from './common.js';

const label = (round, seat) => escapeHtml(rawSeatLabel(round, seat));

/** Текст вопроса в HTML: символы ⚀–⚅ заменены нарисованными кубиками (30 px), остальное экранировано. */
const diced = (text) => splitDice(text).map((p) => ('face' in p ? renderDie(p.face, 's') : escapeHtml(p.text))).join('');

export function setupQuizDrill() {
  const startBox = $('#dEStart');
  const play = $('#dEPlay');
  const endBox = $('#dEEnd');
  const goBtn = $('#dEGo');
  const lastEl = $('#dELast');
  const progEl = $('#dEProgress');
  const pointsEl = $('#dEPoints');
  const bar = $('#dEBar');
  const scene = $('#dEScene');
  const ask = $('#dEAsk');
  const fb = $('#dEFb');
  const nextBtn = $('#dENext');
  const reveal = $('#dEReveal');
  const revealBody = $('#dERevealBody');
  const revealNext = $('#dERevealNext');
  const endText = $('#dEEndText');
  const endPoints = $('#dEEndPoints');
  const kindsEl = $('#dEKinds');
  const weakEl = $('#dEWeak');
  const againBtn = $('#dEAgain');
  if (!startBox || !play || !endBox || !goBtn || !progEl || !pointsEl || !bar || !scene || !ask || !fb || !nextBtn || !reveal || !revealBody || !revealNext || !endText || !endPoints || !kindsEl || !weakEl || !againBtn) return null;

  let series = null;
  let answered = false;
  let num = 0;
  let saved = false;        // записана ли текущая серия в статистику
  let tableToReveal = -1;   // номер стола, у которого после ответа откроются руки

  const screen = (name) => {
    startBox.classList.toggle('hide', name !== 'start');
    play.classList.toggle('hide', name !== 'play');
    reveal.classList.toggle('hide', name !== 'reveal');
    endBox.classList.toggle('hide', name !== 'end');
  };

  /** Ваши кубики, число кубиков у соперников и ход ставок; чужих рук здесь нет. */
  function sceneHtml(round) {
    const seats = round.dice.map((d, i) => (i === round.me ? '' :
      `<span class="quiz-seat"><span class="quiz-seat-name">${label(round, i)}</span>${renderHiddenDice(d)}</span>`)).join('');
    const rows = round.bids.map((b, i) =>
      `<li class="read-bid${b.s === round.me ? ' is-me' : ''}"><span class="read-bid-n">${i + 1}</span>` +
      `<span class="read-bid-who">${label(round, b.s)}</span>${renderBid(b.q, b.f)}</li>`).join('');
    const end = round.end?.kind === 'dudo'
      ? `<li class="read-bid quiz-call"><span class="read-bid-n">${round.bids.length + 1}</span><span class="read-bid-who">${label(round, round.end.by)}</span><b>Не верю</b></li>`
      : '';
    return `<p>Ваши кубики: ${renderHand(round.hands[round.me], round.wild)}<br>` +
      (round.wild ? 'Единицы — джокеры: считаются за любую цифру, на кубиках выделены цветом.' : 'Единицы обычные: за другие цифры не считаются (раунд Палифико).') +
      `</p><div class="quiz-seats" aria-label="Кубиков у соперников">${seats}</div><ol class="read-bids" aria-label="Ставки раунда по порядку">${rows}${end}</ol>`;
  }

  function askHtml(q) {
    const title = `<p class="quiz-q">${diced(q.title)}</p>`;
    if (q.input === 'number') {
      return `${title}<div class="quiz-step"><button type="button" class="quiz-minus" aria-label="Меньше">−</button>` +
        `<output id="dENum" class="quiz-num" aria-live="polite">${num}</output>` +
        `<button type="button" class="quiz-plus" aria-label="Больше">+</button></div>` +
        '<button type="button" class="btn-primary quiz-send"><span class="btn-main">Ответить</span></button>';
    }
    return `${title}<div class="quiz-opts${q.input === 'two' ? ' quiz-opts-two' : ''}" role="group" aria-label="Ваш ответ">` +
      q.options.map((o) => `<button type="button" class="quiz-opt" data-v="${escapeHtml(o.v)}">${diced(o.label)}</button>`).join('') +
      '</div>';
  }

  function render() {
    const cur = currentQuestion(series);
    if (!cur) { finish(); return; }
    answered = false;
    tableToReveal = -1;
    screen('play');
    const p = progress(series);
    progEl.textContent = progressLabel(p, series.tables.length, PER_TABLE);
    bar.max = totalQuestions(series);
    bar.value = series.results.length;
    pointsEl.textContent = `Баллы: ${pointsBeforeTable(series, p.table)}`;   // внутри стола счёт не растёт: он выдал бы верные ответы
    scene.innerHTML = sceneHtml(cur.round);
    const q = cur.question;
    if (q.input === 'number') num = q.range.min;   // счётчик с нуля: стартовое число не подсказывает ответ
    ask.innerHTML = askHtml(q);
    fb.innerHTML = '';
    nextBtn.classList.add('hide');
  }

  /** Строка про последнюю сохранённую серию на старте. */
  function showLast() {
    const text = lastEl ? lastSeriesText(getStats().quizLast, getStats().quizPrev) : null;
    if (!lastEl) return;
    lastEl.hidden = !text;
    lastEl.textContent = text ?? '';
  }

  function finish() {
    const sum = summarize(series);
    if (!saved) {   // серия записывается один раз: счётчики по видам вопросов и последняя серия
      saved = true;
      updateStats((S) => { S.byTag = addQuizResults(S.byTag, series.results); if (S.quizLast) S.quizPrev = S.quizLast; S.quizLast = lastSeriesRecord(sum); });
    }
    const v = summaryView(sum);
    screen('end');
    endText.textContent = `Верно: ${v.headline}`;
    endPoints.textContent = v.points;
    kindsEl.innerHTML = v.kinds.map((k) =>
      `<li class="quiz-kind"><span class="quiz-kind-name">${escapeHtml(k.name)}</span><b>${escapeHtml(k.text)}</b>` +
      `<progress class="quiz-meter" max="100" value="${k.rate}" aria-label="${escapeHtml(k.name)}: ${k.rate} %"></progress>` +
      `<span class="quiz-kind-note muted">${escapeHtml(k.note)}</span></li>`).join('');
    weakEl.textContent = v.weak;
  }

  /** Конец стола: руки всех игроков, итог раунда и ответы по четырём вопросам. */
  function showReveal(tableIdx) {
    const { round, questions } = series.tables[tableIdx];
    const hands = round.hands.map((h, i) =>
      `<div class="quiz-hand-row"><span class="quiz-hand-who">${label(round, i)}</span><span class="quiz-hand-dice">${renderHand(h, round.wild, 's')}</span></div>`).join('');
    const last = round.bids[round.bids.length - 1];
    const mine = series.results.filter((r) => r.table === tableIdx);
    const good = mine.filter((r) => r.ok).length;
    const rows = mine.map((r) => {
      const v = resultLine(r);
      const q = questions[r.index];
      return `<li><b>${diced(q.short ?? q.title)}</b><br><span class="quiz-verdict is-${v.tone}"><span class="quiz-mark" aria-hidden="true">${verdictMark(v.tone)}</span> ${escapeHtml(v.text)}</span>` +
        `<span class="quiz-why muted">${diced(q.explain)}</span></li>`;
    }).join('');
    revealBody.innerHTML = `<p class="quiz-q">Стол ${tableIdx + 1}: верно ${good} из ${mine.length}</p>` +
      `<div class="quiz-hands" aria-label="Руки при вскрытии">${hands}</div>` +
      (last ? `<p class="quiz-outcome"><span>Последняя ставка</span>${renderBid(last.q, last.f)}</p>` +
        `<p>На столе оказалось ${round.end.actual}: ставка ${round.end.actual >= last.q ? 'верна' : 'не верна'}.</p>` : '') +
      `<ul class="quiz-recap">${rows}</ul>`;
    pointsEl.textContent = `Баллы: ${totalPoints(series)}`;
    revealNext.querySelector('.btn-main').textContent = progress(series).done ? 'Итог серии' : 'Следующий стол';
    screen('reveal');
  }

  function answer(value) {
    if (answered) return;
    const cur = currentQuestion(series);
    if (!cur) return;
    answered = true;
    const out = submitAnswer(series, value);
    series = out.series;
    const q = cur.question;
    // Верно или нет, пояснение и счёт до вскрытия не показываются: иначе они подсказывают следующие вопросы стола.
    ask.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (q.input !== 'number') ask.querySelector(`.quiz-opt[data-v="${CSS.escape(String(value))}"]`)?.classList.add('is-chosen');
    fb.innerHTML = '<p class="quiz-accepted">Ответ принят. Оценка будет при вскрытии стола.</p>';
    nextBtn.querySelector('.btn-main').textContent = out.tableDone ? 'Открыть руки' : 'Дальше';
    tableToReveal = out.tableDone ? cur.table : -1;
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

  nextBtn.onclick = () => { if (tableToReveal >= 0) showReveal(tableToReveal); else render(); };
  revealNext.onclick = () => render();

  function start() {
    series = createSeries({ rounds: getRounds() });
    saved = false;
    if (!series.tables.length) { showLast(); screen('start'); return; }
    render();
  }

  goBtn.onclick = start;
  againBtn.onclick = start;

  return {
    /** Открытие вкладки: незаконченная серия продолжается, иначе показывается старт. */
    show() { if (!series) { showLast(); screen('start'); } },
  };
}
