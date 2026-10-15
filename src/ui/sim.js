// src/ui/sim.js — Симуляция: сравнение стратегий на множестве раздач.

import { P, $, pct } from './common.js';
import { renderBid } from '../table.js';

export function setupSim() {
  const go = $('#sGo');
  if (!go) return;
  go.onclick = () => {
    if (!P) return;
    const n = +$('#sN').value;
    const R = +$('#sR').value;
    const w = $('#sW').checked;

    const cnt = Array.from({ length: 7 }, () => new Array(n + 2).fill(0));

    for (let r = 0; r < R; r++) {
      const d = P.roll(n);
      const c = [0, 0, 0, 0, 0, 0, 0];
      d.forEach((x) => c[x]++);
      for (let f = 1; f <= 6; f++) {
        const total = (f === 1 || !w) ? c[f] : c[f] + c[1];
        for (let q = 0; q <= total; q++) cnt[f][q]++;
      }
    }

    let h = `<p>Доля бросков, где ставка верна (${R.toLocaleString('ru')} бросков, ${n} кубиков).</p>`;
    h += '<table><tr><th>Ставка</th><th>Монте-Карло</th><th>Формула</th></tr>';

    for (let f = 1; f <= 6; f++) {
      const e = n * P.pFace(f, w);
      const probes = [Math.max(1, Math.round(e) - 1), Math.round(e), Math.round(e) + 1];
      for (const q of probes) {
        if (q > n || q < 1) continue;
        h += `<tr><td>${renderBid(q, f)}</td><td>${pct(cnt[f][q] / R)}</td>` +
          `<td>${pct(P.atLeast(q, n, P.pFace(f, w)))}</td></tr>`;
      }
    }
    h += '</table>';

    const out = $('#sOut');
    if (out) out.innerHTML = h;
  };
}
