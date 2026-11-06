// src/ui/read_drill_view.js — упражнение «Читай вскрытие» во вкладке «Упражнения».
//
// Логика задания и проверки — в read_drill.js. Здесь только экран: чужие руки в страницу попадают
// не раньше, чем нажата «Проверить».

import { getRounds, updateStats } from '../storage.js';
import { renderBid, renderHand } from '../table.js';
import { $ } from './common.js';
import { pickReadRound, buildReadTask, checkReadAnswers, seatLabel, addReadResult, canRead } from '../read_drill.js';
import { makeSimRound, chooseSource, isSimRound } from '../read_sim.js';
import { makeEntry, addEntry, seriesSummary, seriesLines, STEP } from '../calibration.js';

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
  let series = [];   // ответы за сеанс для оценки серии; в хранилище не пишется

  // Ответ считается данным, когда ползунок сдвинули: иначе стартовые 50 % засчитались бы как оценка
  const picked = (n) => {
    const el = ask.querySelector(`input[name="rd${n}"]`);
    return el && el.dataset.set === '1' ? Number(el.value) : null;
  };
  const sync = () => { btn.disabled = done || !task || task.questions.some((q) => !picked(q.n)); };

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
    fb.innerHTML = '';
    if (!round || !task) { round = null; task = null; show(false); sync(); return; }
    seen.add(round.id);
    show(true);
    const sizes = task.dice.map((d, i) => `${seatLabel(round, i)} — ${d}`).join(' · ');
    head.innerHTML = `Ваши кубики: ${renderHand(task.hand, task.wild)}<br>` +
      `Кубиков в руках: <b>${sizes}</b>. ${task.wild ? 'Единицы — джокеры.' : 'Единицы обычные (Палифико).'}` +
      (isSimRound(round) ? '<br><span class="read-sim muted">Учебный раунд: его сыграли боты программы. В статистику он не идёт.</span>' : '');
    bidsEl.innerHTML = task.bids.map((b) =>
      `<li class="read-bid${b.isMe ? ' is-me' : ''}"><span class="read-bid-n">${b.n}</span>` +
      `<span class="read-bid-who">${seatLabel(round, b.seat)}</span>${renderBid(b.q, b.f)}</li>`).join('');
    ask.innerHTML = task.questions.map((q) =>
      `<fieldset class="read-q" data-n="${q.n}"><legend>Ставка ${q.n}: ${seatLabel(round, q.seat)} назвал ${renderBid(q.q, q.f)}</legend>` +
      `<label class="read-conf"><span>Уверенность, что в его руке есть нужная цифра: <output class="read-conf-out" id="rdOut${q.n}">сдвиньте ползунок</output></span>` +
      `<input type="range" class="read-range" name="rd${q.n}" min="0" max="100" step="${STEP}" value="50" aria-describedby="rdOut${q.n}"></label>` +
      '</fieldset>').join('');
    sync();
  }

  ask.addEventListener('input', (e) => {
    const el = e.target.closest('.read-range');
    if (!el) return;
    el.dataset.set = '1';
    const out = ask.querySelector(`#${el.getAttribute('aria-describedby')}`);
    if (out) out.textContent = `${el.value} %`;
    sync();
  });

  btn.onclick = () => {
    if (done || !round || !task) return;
    const answers = {};
    for (const q of task.questions) answers[q.n] = picked(q.n);
    const res = checkReadAnswers(round, task, answers);
    if (!res) return;
    done = true;
    if (!isSimRound(round)) updateStats((S) => { S.byTag = addReadResult(S.byTag, res); });
    for (const it of res.items) series = addEntry(series, makeEntry({ p: it.p, prior: it.prior, truth: it.has }));
    const seriesHtml = seriesLines(seriesSummary(series)).map((l) => `<li>${l}</li>`).join('');
    for (const it of res.items) {
      const box = ask.querySelector(`.read-q[data-n="${it.n}"]`);
      box?.classList.add(it.ok ? 'is-ok' : 'is-bad');
    }
    ask.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    const hands = round.hands.map((h, i) =>
      `<div class="read-hand-row"><span class="read-hand-who">${seatLabel(round, i)}</span>${renderHand(h, round.wild, 'sm')}</div>`).join('');
    fb.innerHTML =
      `<p class="${res.good === res.total ? 'text-ok' : 'text-bad'}">С правильной стороны от 50 %: ${res.good} из ${res.total}.</p>` +
      `<ul class="read-lines">${res.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` +
      `<p>${res.outcome}</p>` +
      `<div class="read-series"><b>Оценка серии</b><ul class="read-lines">${seriesHtml}</ul></div>` +
      `<div class="read-hands" aria-label="Руки при вскрытии">${hands}</div>`;
    sync();
  };

  return { next };
}
