// src/ui/read_drill_view.js — упражнение «Читай вскрытие» во вкладке «Упражнения».
//
// Логика задания и проверки — в read_drill.js. Здесь только экран: чужие руки в страницу попадают
// не раньше, чем нажата «Проверить».

import { getRounds, updateStats, getSettings, setSettings } from '../storage.js';
import { renderBid, renderHand, renderDie, escapeHtml } from '../table.js';
import { $ } from './common.js';
import { pickReadRound, buildReadTask, checkReadAnswers, seatLabel as rawSeatLabel, addReadResult, canRead, addSeries, seriesLines, feedRows, knownFacts, priorHint } from '../read_drill.js';
import { makeSimRound, chooseSource, isSimRound } from '../read_sim.js';
import { verdictMark } from '../quiz_text.js';

const seatLabel = (round, seat) => escapeHtml(rawSeatLabel(round, seat));

export function setupReadDrill() {
  const body = $('#dCBody');
  const empty = $('#dCEmpty');
  const head = $('#dCq');
  const bidsEl = $('#dCBids');
  const ask = $('#dCAsk');
  const fb = $('#dCfb');
  const btn = $('#dCCheck');
  if (!body || !head || !bidsEl || !ask || !fb || !btn) return null;

  const seen = new Set();
  let round = null;
  let task = null;
  let done = false;
  let series = null;   // ответы за сеанс для оценки серии; в хранилище не пишется

  /** Карточка «Что вы знаете»: числа считаются сами, ваши подходящие кубики подсвечены. */
  function knownHtml(q) {
    const k = knownFacts(task, q);
    const dice = k.mineDice.map((d) =>
      `<span class="read-mine${d.match ? ' is-match' : ''}">${renderDie(d.v, 'xs', task.wild && d.v === 1)}</span>`).join('');
    return '<div class="read-know">' +
      `<p><b>Что вы знаете.</b> Кубиков у игрока: ${k.size}. Скрыто от вас: ${k.hidden}.</p>` +
      `<p>Ваши кубики: <span class="read-mine-row">${dice}</span> Нужной цифры у вас: ${k.mine}.</p>` +
      `<p class="read-prior">${priorHint(q, task.wild)}</p></div>`;
  }

  // «Режим новичка»: подсказка с начальным шансом; по умолчанию выключен, выбор запоминается в настройках
  const beginner = $('#dBeginner');
  const panel = $('#dPanelC');
  const applyBeginner = (on) => {
    if (panel) { if (on) panel.dataset.beginner = '1'; else delete panel.dataset.beginner; }
  };
  if (beginner) {
    beginner.checked = getSettings().beginnerMode === true;
    applyBeginner(beginner.checked);
    beginner.addEventListener('change', () => {
      setSettings({ beginnerMode: beginner.checked });
      applyBeginner(beginner.checked);
    });
  }

  const hint = $('#dCHint');
  const answers = {};   // номер ставки → 'yes' | 'no'
  const sync = () => {
    const left = task ? task.questions.filter((q) => !answers[q.n]).length : 0;
    btn.disabled = done || !task || left > 0;
    if (hint) hint.textContent = done || !task || !left ? '' : `Чтобы проверить, ответьте на все вопросы. Осталось: ${left}.`;
  };

  function show(on) {
    body.classList.toggle('hide', !on);
    empty?.classList.toggle('hide', on);
  }

  /** Новое задание: раунд из сохранённых, ещё не показанные идут первыми. */
  function next() {
    const real = getRounds();
    const useSim = chooseSource(real.filter(canRead).length) === 'sim';
    round = useSim ? makeSimRound(Math.floor(Math.random() * 2 ** 31)) : pickReadRound(real, seen);
    if (!round) round = useSim ? pickReadRound(real, seen) : null;
    task = round ? buildReadTask(round) : null;
    done = false;
    for (const k of Object.keys(answers)) delete answers[k];
    fb.innerHTML = '';
    if (!round || !task) { round = null; task = null; show(false); sync(); return; }
    seen.add(round.id);
    show(true);
    const sizes = task.dice.map((d, i) => `${seatLabel(round, i)} — ${d}`).join(' · ');
    head.innerHTML = `Ваши кубики: ${renderHand(task.hand, task.wild)}<br>` +
      `Кубиков в руках: <b>${sizes}</b>.<br>` +
      'Вопросы про руку автора ставки, а не про весь стол. Спрашиваем о нескольких ставках соперников: они отмечены в ленте.<br>' +
      (task.wild ? 'Единицы — джокеры: считаются за любую цифру.' : 'Единицы обычные: за другие цифры не считаются (раунд Палифико).') +
      (isSimRound(round) ? '<p class="read-sim"><b>Учебный раунд.</b> Его сыграли боты программы, в статистику он не идёт.</p>' : '');
    bidsEl.innerHTML = feedRows(task).map((b) =>
      `<li class="read-bid${b.isMe ? ' is-me' : ''}${b.asked ? ' is-asked' : ''}"><span class="read-bid-n">${b.n}</span>` +
      `<span class="read-bid-who">${seatLabel(round, b.seat)}<span class="read-bid-act muted">${b.action}</span></span>` +
      (b.asked ? '<span class="read-bid-tag">Оцените</span>' : '') +
      `${renderBid(b.q, b.f)}</li>`).join('');
    ask.innerHTML = task.questions.map((q) =>
      `<div class="read-q" role="group" data-n="${q.n}" aria-labelledby="rdT${q.n}">` +
      `<p class="read-q-title" id="rdT${q.n}">${seatLabel(round, q.seat)}: есть ли в руке хоть одна ${renderDie(q.f, 's')}?</p>` +
      `<p class="read-q-bid muted">Ставка №${q.n}, ${seatLabel(round, q.seat)}: ${renderBid(q.q, q.f)}</p>` +
      knownHtml(q) +
      '<div class="read-yn" role="group" aria-label="Ваш ответ">' +
      `<button type="button" class="read-yn-btn" data-n="${q.n}" data-v="yes" aria-pressed="false">Да</button>` +
      `<button type="button" class="read-yn-btn" data-n="${q.n}" data-v="no" aria-pressed="false">Нет</button></div>` +
      '</div>').join('');
    sync();
  }

  ask.addEventListener('click', (e) => {
    const b = e.target.closest('.read-yn-btn');
    if (!b || done) return;
    const n = Number(b.dataset.n);
    answers[n] = b.dataset.v;
    for (const x of ask.querySelectorAll(`.read-yn-btn[data-n="${n}"]`)) {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    sync();
  });

  btn.onclick = () => {
    if (done || !round || !task) return;
    const res = checkReadAnswers(round, task, { ...answers });
    if (!res) return;
    done = true;
    if (!isSimRound(round)) updateStats((S) => { S.byTag = addReadResult(S.byTag, res); });
    series = addSeries(series, res);
    const seriesHtml = seriesLines(series).map((l) => `<li>${l}</li>`).join('');
    for (const it of res.items) {
      const box = ask.querySelector(`.read-q[data-n="${it.n}"]`);
      box?.classList.add(it.ok ? 'is-ok' : 'is-bad');
      box?.querySelector('.read-q-verdict')?.remove();
      box?.insertAdjacentHTML('beforeend', `<p class="read-q-verdict ${it.ok ? 'text-ok' : 'text-bad'}">` +
        `<span class="quiz-mark">${verdictMark(it.ok ? 'ok' : 'bad')}</span> ` +
        `${it.ok ? 'Верно' : 'Неверно'}: в руке нужной цифры ${it.has ? 'есть' : 'нет'}.</p>`);
      box?.querySelector(`.read-yn-btn[data-v="${it.has ? 'yes' : 'no'}"]`)?.classList.add('is-right');
    }
    ask.querySelectorAll('.read-yn-btn').forEach((i) => { i.disabled = true; });
    const hands = round.hands.map((h, i) =>
      `<div class="read-hand-row"><span class="read-hand-who">${seatLabel(round, i)}</span>${renderHand(h, round.wild, 'sm')}</div>`).join('');
    fb.innerHTML =
      `<p class="${res.good === res.total ? 'text-ok' : 'text-bad'}">Угадано: ${res.good} из ${res.total}.</p>` +
      `<ul class="read-lines">${res.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` +
      `<p>${res.outcome}</p>` +
      `<div class="read-series"><b>Серия за сеанс</b><ul class="read-lines">${seriesHtml}</ul></div>` +
      `<div class="read-hands" aria-label="Руки при вскрытии">${hands}</div>`;
    sync();
  };

  return { next };
}
