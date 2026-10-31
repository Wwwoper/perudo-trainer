// src/ui/read_drill_view.js — упражнение «Читай вскрытие» во вкладке «Упражнения».
//
// Логика задания и проверки — в read_drill.js. Здесь только экран: чужие руки в страницу попадают
// не раньше, чем нажата «Проверить».

import { getRounds } from '../storage.js';
import { renderBid, renderHand } from '../table.js';
import { $ } from './common.js';
import { pickReadRound, buildReadTask, checkReadAnswers, seatLabel } from '../read_drill.js';

const OPTIONS = [['has', 'Цифра в руке есть'], ['none', 'Цифры в руке нет']];

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

  const picked = (n) => ask.querySelector(`input[name="rd${n}"]:checked`)?.value ?? null;
  const sync = () => { btn.disabled = done || !task || task.questions.some((q) => !picked(q.n)); };

  function show(on) {
    body.classList.toggle('hide', !on);
    empty?.classList.toggle('hide', on);
  }

  /** Новое задание: раунд из сохранённых, ещё не показанные идут первыми. */
  function next() {
    round = pickReadRound(getRounds(), seen);
    task = round ? buildReadTask(round) : null;
    done = false;
    fb.innerHTML = '';
    if (!round || !task) { round = null; task = null; show(false); sync(); return; }
    seen.add(round.id);
    show(true);
    const sizes = task.dice.map((d, i) => `${seatLabel(round, i)} — ${d}`).join(' · ');
    head.innerHTML = `Ваши кубики: ${renderHand(task.hand, task.wild)}<br>` +
      `Кубиков в руках: <b>${sizes}</b>. ${task.wild ? 'Единицы — джокеры.' : 'Единицы обычные (Палифико).'}`;
    bidsEl.innerHTML = task.bids.map((b) =>
      `<li class="read-bid${b.isMe ? ' is-me' : ''}"><span class="read-bid-n">${b.n}</span>` +
      `<span class="read-bid-who">${seatLabel(round, b.seat)}</span>${renderBid(b.q, b.f)}</li>`).join('');
    ask.innerHTML = task.questions.map((q) =>
      `<fieldset class="read-q" data-n="${q.n}"><legend>Ставка ${q.n}: ${seatLabel(round, q.seat)} назвал ${renderBid(q.q, q.f)}</legend>` +
      OPTIONS.map(([v, label]) =>
        `<label class="read-opt"><input type="radio" name="rd${q.n}" value="${v}"><span>${label}</span></label>`).join('') +
      '</fieldset>').join('');
    sync();
  }

  ask.addEventListener('change', sync);

  btn.onclick = () => {
    if (done || !round || !task) return;
    const answers = {};
    for (const q of task.questions) answers[q.n] = picked(q.n);
    const res = checkReadAnswers(round, task, answers);
    if (!res) return;
    done = true;
    for (const it of res.items) {
      const box = ask.querySelector(`.read-q[data-n="${it.n}"]`);
      box?.classList.add(it.ok ? 'is-ok' : 'is-bad');
    }
    ask.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    const hands = round.hands.map((h, i) =>
      `<div class="read-hand-row"><span class="read-hand-who">${seatLabel(round, i)}</span>${renderHand(h, round.wild, 'sm')}</div>`).join('');
    fb.innerHTML =
      `<p class="${res.good === res.total ? 'text-ok' : 'text-bad'}">Верно ${res.good} из ${res.total}.</p>` +
      `<ul class="read-lines">${res.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` +
      `<p>${res.outcome}</p>` +
      `<div class="read-hands" aria-label="Руки при вскрытии">${hands}</div>`;
    sync();
  };

  return { next };
}
