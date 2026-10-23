// src/ui/calculator.js — Калькулятор: вероятность ставки по вашей руке.

import { renderDie, renderHand, renderBid } from '../table.js';
import { P, $, $$, pct } from './common.js';

export function setupCalculator() {
  if (!P) return;

  let hand = [1, 3, 5, 5, 6];

  // «Чтение чужих ставок»: на широком экране блок раскрыт, на телефоне свёрнут, чтобы не загромождать панель
  const readBox = $('#cReadBox');
  if (readBox && window.matchMedia?.('(min-width: 720px)').matches) readBox.open = true;

  const faceSel = $('#cF');
  if (faceSel) {
    faceSel.innerHTML = '';
    for (let f = 1; f <= 6; f++) faceSel.add(new Option(String(f), f));
    faceSel.value = 5;
  }

  // Выбор грани кнопками; источник правды остаётся в #cF (скрытый select)
  const facePick = $('#cPick');
  if (facePick && faceSel) {
    facePick.innerHTML = '';
    for (let f = 1; f <= 6; f++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'face-btn';
      b.innerHTML = renderDie(f, 's');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Цифра ${f}`);
      b.onclick = () => { faceSel.value = f; calc(); };
      facePick.append(b);
    }
  }
  const stepQ = (d) => {
    const q = $('#cQ');
    if (!q) return;
    q.value = Math.max(1, (+q.value || 1) + d);
    calc();
  };
  if ($('#cMinus')) $('#cMinus').onclick = () => stepQ(-1);
  if ($('#cPlus')) $('#cPlus').onclick = () => stepQ(1);

  const pad = $('#cPad');
  if (pad) {
    pad.innerHTML = '';
    for (let d = 1; d <= 6; d++) {
      const b = document.createElement('button');
      b.textContent = `+${d}`;
      b.setAttribute('aria-label', `Добавить кубик ${d}`);
      b.onclick = () => {
        const n = +$('#cN').value || 60;
        if (hand.length < n) { hand.push(d); calc(); }
      };
      pad.append(b);
    }
  }

  if ($('#cClr')) $('#cClr').onclick = () => { hand = []; calc(); };
  if ($('#cRnd')) $('#cRnd').onclick = () => { hand = P.roll(Math.min(5, +$('#cN').value || 5)); calc(); };
  if ($('#cUndo')) $('#cUndo').onclick = () => { hand.pop(); calc(); };

  function calc() {
    if (!P) return;
    const n = +$('#cN').value || 1;
    const t = +$('#cT').value;
    const w = $('#cW').checked;
    const tr = +$('#cTr').value;

    if (hand.length > n) hand = hand.slice(0, n);

    if ($('#cHand')) $('#cHand').innerHTML = renderHand(hand, w);
    if ($('#cTrV')) $('#cTrV').textContent = tr.toFixed(2);

    const q = Math.max(1, +$('#cQ').value || 1);
    const f = Math.max(1, Math.min(6, +$('#cF').value || 5));
    const p = P.probBid(q, f, n, hand, w);

    $$('#cPick .face-btn').forEach((b, i) => {
      const on = i + 1 === f;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
    });

    if ($('#cRes')) {
      const verdict = p >= t ? 'ВЕРЮ / можно повышать осторожно' : 'НЕ ВЕРЮ';
      $('#cRes').innerHTML =
        `${renderBid(q, f)} <b>${pct(p)}</b> → <span class="${p >= t ? 'text-ok' : 'text-bad'}">${verdict}</span>`;
    }

    const unk = n - hand.length;
    const kF = Math.max(0, Math.min(+$('#cK').value || 0, unk));
    const pr = P.probBidRead(q, f, hand,
      [{ k: kF, faces: [f] }, { k: unk - kF, faces: [] }], w, tr);

    if ($('#cRead')) {
      $('#cRead').innerHTML = kF > 0
        ? `С учётом чтения ставок (${kF} куб. у ставивших на эту цифру, доверие ${tr.toFixed(2)}): <b class="${pr >= t ? 'text-ok' : 'text-bad'}">${pct(pr)}</b>`
        : '<span class="muted">Чтобы учесть чужие ставки, укажите, сколько кубиков у игроков, поставивших на эту цифру.</span>';
    }

    if ($('#cTbl')) {
      let h = '<table><tr><th>Цифра</th><th>У вас</th><th>Макс. кол-во</th><th>Шанс</th><th>На 1 больше</th><th></th></tr>';
      for (let ff = 1; ff <= 6; ff++) {
        const m = P.bestBid(ff, n, hand, w, t);
        const pq = m ? P.probBid(m, ff, n, hand, w) : 0;
        const pn = P.probBid(m + 1, ff, n, hand, w);
        h += `<tr><td>${renderDie(ff, 'xs')}</td><td>${P.own(hand, ff, w)}</td><td>${m}</td><td>${pct(pq)}</td><td>${pct(pn)}</td><td><div class="bar"><i style="width:${pq * 100}%"></i></div></td></tr>`;
      }
      $('#cTbl').innerHTML = h + '</table>';
    }
  }

  ['#cN', '#cT', '#cW', '#cQ', '#cF', '#cK', '#cTr'].forEach((s) => {
    const el = $(s);
    if (el) el.addEventListener('input', calc);
  });

  calc();
}
