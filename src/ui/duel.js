// src/ui/duel.js — Дуэль 1 на 1 против решения CFR.

import { getDuelStats, setDuelStats } from '../storage.js';
import { renderDie, renderBid } from '../table.js';
import { P, $ } from './common.js';

let duelTree = null;
let duelState = null;
let duelStats = getDuelStats();

export function setupDuel() {
  if (!P) return;
  if ($('#dSolve')) $('#dSolve').onclick = () => solveNow();
  if ($('#dStart')) $('#dStart').onclick = () => startDuel();
}

export function solveNow(cb) {
  if (!P) return;
  const info = $('#dInfo');
  if (info) info.textContent = 'Считаю равновесие (CFR+, 200 итераций)…';
  setTimeout(() => {
    const t0 = performance.now();
    duelTree = P.solveDuel({ iters: 200 });
    const ms = performance.now() - t0;
    if (info) {
      info.innerHTML =
        `Готово за ${(ms / 1000).toFixed(1)} с. Ценность игры для открывающего: ` +
        `<b>${duelTree.value.toFixed(3)}</b> кубика за раунд; неэксплуатируемость: ` +
        `<b>${duelTree.exploitability.toFixed(4)}</b>.`;
    }
    renderOpening();
    if (cb) cb();
  }, 30);
}

function renderOpening() {
  if (!duelTree || !P) return;
  const el = $('#dOpen');
  if (!el) return;

  const root = duelTree.root;
  const used = root.acts
    .map((a, i) => ({ a, i }))
    .filter((c) => root.avg.some((r) => r[c.i] >= 0.01));

  let t = '<table><tr><th>Ваш кубик</th>' +
    used.map((c) => `<th>${renderBid(c.a.q, c.a.f)}</th>`).join('') +
    '</tr>';

  for (let h = 0; h < 6; h++) {
    t += `<tr><td>${renderDie(h + 1, 'xs', h === 0)}</td>`;
    for (const c of used) {
      const v = root.avg[h][c.i];
      t += `<td style="background:color-mix(in srgb, var(--acc) ${Math.round(Math.min(0.9, v * 1.2) * 100)}%, transparent)">${v >= 0.01 ? (v * 100).toFixed(0) + '%' : ''}</td>`;
    }
    t += '</tr>';
  }
  el.innerHTML = '<p class="muted">Оптимальные частоты первой ставки в зависимости от вашего кубика:</p>' + t + '</table>';
}

export function startDuel() {
  if (!duelTree) { solveNow(startDuel); return; }
  const role = Math.random() < 0.5 ? 0 : 1;
  const hs = [P.ri(1, 6) - 1, P.ri(1, 6) - 1];
  duelState = { role, hs, node: duelTree.root, over: false, log: [], fb: '' };
  runDuelBot();
  renderDuel();
}

function runDuelBot() {
  if (!duelState || !duelTree) return;
  const D = duelState;
  while (!D.over && D.node.p !== D.role) {
    const node = D.node;
    const row = node.avg[D.hs[node.p]];
    let r = Math.random(), idx = 0;
    for (let a = 0; a < row.length; a++) {
      r -= row[a];
      if (r <= 0) { idx = a; break; }
      idx = a;
    }
    const act = node.acts[idx];
    if (act === 'D') {
      D.log.push(`<div class="log-row"><span class="player-name c1">Бот</span> <b class="text-bad">не верит!</b></div>`);
      endDuel(node.p, node);
      return;
    }
    D.log.push(`<div class="log-row"><span class="player-name c1">Бот</span> ${renderBid(act.q, act.f)}</div>`);
    let k = 0;
    for (const a of node.acts) {
      if (a === 'D') continue;
      if (a === act) break;
      k++;
    }
    D.node = node.kids[k];
  }
}

function endDuel(caller, node) {
  const D = duelState;
  const q = node.last.q;
  const f = node.last.f;
  const c = P.duelCount(D.hs[0], D.hs[1], f);
  const callerWins = c < q;
  const winner = callerWins ? caller : 1 - caller;
  const meWin = winner === D.role;

  D.over = true;
  duelStats.games++;
  if (meWin) duelStats.wins++;
  setDuelStats(duelStats);

  D.result = `Проверка ${renderBid(q, f)}: вместе <b>${c}</b>. ` +
    (meWin ? '<b class="text-ok">Вы выиграли раунд 🎉</b>' : '<b class="text-bad">Вы проиграли раунд</b>') +
    `. Ваш кубик: ${renderDie(D.hs[D.role] + 1, 'xs', D.hs[D.role] === 0)}, ` +
    `кубик бота: ${renderDie(D.hs[1 - D.role] + 1, 'xs', D.hs[1 - D.role] === 0)}.`;
}

function renderDuel() {
  const el = $('#dPlay');
  if (!el || !duelState) return;
  const D = duelState;
  const my = D.hs[D.role];

  let html = `<div>Ваш кубик: ${renderDie(my + 1, '', my === 0)} ` +
    `<span class="muted">· вы ${D.role === 0 ? 'открываете' : 'отвечаете'}</span></div>` +
    `<div class="duel-log">${D.log.join('') || '<span class="muted">Ставок ещё нет</span>'}</div>`;

  if (D.over) {
    html += `<p>${D.result}</p>`;
  } else {
    html += '<div class="duel-moves">' + D.node.acts.map((a, i) =>
      `<button data-i="${i}" class="${a === 'D' ? 'bad' : ''}">${a === 'D' ? 'Не верю!' : a.q + ' × ' + a.f
      }</button>`).join('') + '</div>';
  }

  html += `<div class="muted duel-fb">${D.fb || ''}</div>` +
    `<p class="muted">Сессия: партий ${duelStats.games}, побед ${duelStats.wins}; ` +
    `редких отклонений от оптимума: ${duelStats.dev} из ${duelStats.moves}.</p>`;

  el.innerHTML = html;

  el.querySelectorAll('button[data-i]').forEach((b) => {
    b.onclick = () => moveDuel(+b.dataset.i);
  });
}

export function moveDuel(i) {
  const D = duelState;
  if (!D || D.over) return;
  const node = D.node;
  const act = node.acts[i];
  const my = D.hs[D.role];
  const pr = node.avg[my][i];

  duelStats.moves++;
  if (pr < 0.05) duelStats.dev++;
  setDuelStats(duelStats);

  D.fb = `Ваш ход ${act === 'D' ? '«Не верю»' : act.q + '×' + act.f}: оптимальная частота ` +
    `${(pr * 100).toFixed(0)}% ${pr < 0.05 ? '<b class="text-bad">— редкое отклонение</b>' : '<b class="text-ok">— в рамках</b>'}.`;

  if (act === 'D') {
    D.log.push(`<div class="log-row"><span class="player-name c0">Вы</span> <b class="text-bad">не верю!</b></div>`);
    endDuel(D.role, node);
    renderDuel();
    return;
  }

  D.log.push(`<div class="log-row"><span class="player-name c0">Вы</span> ${renderBid(act.q, act.f)}</div>`);
  let k = 0;
  for (const a of node.acts) {
    if (a === 'D') continue;
    if (a === act) break;
    k++;
  }
  D.node = node.kids[k];

  runDuelBot();
  renderDuel();
}

export const getDuelTree = () => duelTree;
export const getDuelState = () => duelState;

/** «Сбросить всё» на вкладке «Статистика»: обнуляет счётчики дуэли в памяти (в localStorage их пишет вызывающий). */
export function resetDuelStats() {
  duelStats = { games: 0, wins: 0, moves: 0, dev: 0 };
}
