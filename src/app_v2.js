// src/app_v2.js — точка входа Perudo Trainer v2
// ES-модуль. Работает и при прямом подключении, и после сборки build.py.

import { createGame, startGame, applyAction, canCalza as engineCanCalza }
  from './engine.js';
import { legal, minLegal } from './rules.js';
import { createAssistConfig, getClassification } from './assist.js';
import {
  getStats, setStats,
  getTrainingQueue, setTrainingQueue, getGames,
  migrateIfNeeded, get, set,
} from './storage.js';
import { BOT_STYLES, generateCharacter, botDecide } from './bots.js';
import { renderTable, renderDie, renderHand, renderBid } from './table.js';

// ================= Общие утилиты =================

const P = window.Perudo;
if (!P) {
  console.error('[perudo] window.Perudo не найден. Убедитесь, что src/core.js подключён раньше app_v2.js');
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const pct = (x) => P ? P.pct(x) : (x * 100).toFixed(1) + '%';

function flash(el, text, cls = 'r') {
  if (!el) return;
  el.innerHTML = `<span class="${cls}">${text}</span>`;
}

/* Локальный bestSafeRaise — раньше жил в core.js.
   Теперь используем rules.legal + P.probBid, чтобы не дублировать
   логику в двух местах. */
function bestSafeRaise(bid, n, hand, rules, thr) {
  thr = thr == null ? 0.5 : thr;
  const wild = !rules || rules.wild !== false;
  let best = null;
  for (let q = 1; q <= n; q++) for (let f = 1; f <= 6; f++) {
    if (!legal(q, f, bid, rules)) continue;
    const p = P.probBid(q, f, n, hand, wild);
    if (p >= thr && (!best || q > best.q || (q === best.q && p > best.p))) {
      best = { q, f, p };
    }
  }
  return best;
}

// ================= Константы =================

const TABS = ['calc', 'train', 'drill', 'game', 'duel', 'stats', 'sim'];

const MODES = {
  classic: {
    name: 'Классика (5 кубиков у вас)', wild: true, n: [10, 20], k: () => 5, bluff: 0.25,
    d: 'Единицы — джокеры. Среднее количество кубиков.'
  },
  nowild: {
    name: 'Без джокеров / Палифико', wild: false, n: [10, 20], k: () => 5, bluff: 0.25,
    d: 'Все цифры имеют шанс 1/6. Ставки заметно меньше.'
  },
  endgame: {
    name: 'Эндшпиль (3–6 кубиков всего)', wild: true, n: [3, 6], k: (n) => P.ri(1, Math.ceil(n / 2)), bluff: 0.3,
    d: 'Почти дуэль: ваши кубики решают многое.'
  },
  big: {
    name: 'Большой стол (25–40 кубиков)', wild: true, n: [25, 40], k: () => 5, bluff: 0.2,
    d: 'Много неизвестных: работает «среднее ожидание».'
  },
  bluffer: {
    name: 'Блефующий соперник', wild: true, n: [10, 20], k: () => 5, bluff: 0.7,
    d: 'Соперник часто завышает ставку — проверяйте на «Не верю».'
  },
  solo: {
    name: 'Мало кубиков у вас (1–2)', wild: true, n: [8, 16], k: () => P.ri(1, 2), bluff: 0.3,
    d: 'Вы почти не знаете свою руку — полагайтесь на вероятность.'
  },
};

// ================= Инициализация =================

migrateIfNeeded();

let assistConfig = createAssistConfig('training');

// ================= Вкладки =================

function setupTabs() {
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.toggle('on', b === btn));
      const target = btn.dataset.t;
      TABS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hide', id !== target);
      });
      if (target === 'stats') renderStats();
    });
  });
}

// ================= Калькулятор =================

function setupCalculator() {
  if (!P) return;

  let hand = [1, 3, 5, 5, 6];

  const faceSel = $('#cF');
  if (faceSel) {
    faceSel.innerHTML = '';
    for (let f = 1; f <= 6; f++) faceSel.add(new Option(String(f), f));
    faceSel.value = 5;
  }

  const pad = $('#cPad');
  if (pad) {
    pad.innerHTML = '';
    for (let d = 1; d <= 6; d++) {
      const b = document.createElement('button');
      b.textContent = `+${d}`;
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

    if ($('#cRes')) {
      const verdict = p >= t ? 'ВЕРЮ / можно повышать осторожно' : 'НЕ ВЕРЮ';
      $('#cRes').innerHTML =
        `${renderBid(q, f)} <b>${pct(p)}</b> → <span class="${p >= t ? 'g' : 'r'}">${verdict}</span>`;
    }

    const unk = n - hand.length;
    const kF = Math.max(0, Math.min(+$('#cK').value || 0, unk));
    const pr = P.probBidRead(q, f, hand,
      [{ k: kF, faces: [f] }, { k: unk - kF, faces: [] }], w, tr);

    if ($('#cRead')) {
      $('#cRead').innerHTML = kF > 0
        ? `С учётом чтения ставок (${kF} куб. у ставивших на эту цифру, доверие ${tr.toFixed(2)}): <b class="${pr >= t ? 'g' : 'r'}">${pct(pr)}</b>`
        : '<span class="m">Чтобы учесть чужие ставки, укажите, сколько кубиков у игроков, поставивших на эту цифру.</span>';
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

// ================= Тренажёр =================

function setupTrainer() {
  if (!P) return;

  const S = getStats();
  S.drill = S.drill || { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };
  S.byMode = S.byMode || {};

  let queue = getTrainingQueue();
  let cur = null;
  let answered = false;

  const modeSel = $('#tMode');
  if (modeSel) {
    modeSel.innerHTML = '';
    for (const key in MODES) modeSel.add(new Option(MODES[key].name, key));
  }
  const faceSel = $('#tF');
  if (faceSel) {
    faceSel.innerHTML = '';
    for (let f = 1; f <= 6; f++) faceSel.add(new Option(String(f), f));
  }

  function persist() { setStats(S); setTrainingQueue(queue); updateStat(); }

  function updateStat() {
    const el = $('#tStat');
    if (!el) return;
    const mk = $('#tMode').value;
    const b = S.byMode[mk] || { n: 0, good: 0 };
    el.innerHTML = `Всего: ${S.n}, верных решений: ${S.good} (${S.n ? pct(S.good / S.n) : '—'}). ` +
      `В выбранном режиме: ${b.n ? `${b.good}/${b.n} (${pct(b.good / b.n)})` : '—'}. ` +
      `В очереди повторов: ${queue.length}.`;
  }

  function newSituation() {
    const mk = $('#tMode').value;
    const m = MODES[mk];
    const pool = queue.filter((x) => x.mode === mk);

    if (pool.length && Math.random() < 0.4) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      cur = { m, n: item.n, h: item.h.slice(), f: item.f, q: item.q, item };
    } else {
      const n = P.ri(m.n[0], m.n[1]);
      const k = Math.min(m.k(n), n - 1) || 1;
      const h = P.roll(k);
      const f = P.ri(1, 6);
      let q = Math.round(n * P.pFace(f, m.wild) + (Math.random() < m.bluff ? P.ri(1, 3) : P.ri(-2, 1)));
      q = Math.max(1, Math.min(n, q));
      cur = { m, n, h, f, q, item: null };
    }

    answered = false;
    if ($('#tDesc')) $('#tDesc').textContent = m.d;
    if ($('#tInfo')) {
      $('#tInfo').innerHTML =
        (cur.item ? `<span class="trainer-chip trainer-repeat">🔁 повтор</span>` : '') +
        `<span class="trainer-chip">🎲 всего <b>${cur.n}</b></span>` +
        `<span class="trainer-chip">👤 у вас <b>${cur.h.length}</b></span>` +
        `<span class="trainer-chip">❓ чужих <b>${cur.n - cur.h.length}</b></span>` +
        `<span class="trainer-chip ${m.wild ? 'trainer-wild' : ''}">` +
        (m.wild ? '✨ единицы — джокеры' : '⚪ единицы обычные') +
        `</span>`;
    }
    if ($('#tHand')) $('#tHand').innerHTML = renderHand(cur.h, m.wild);
    if ($('#tBid')) $('#tBid').innerHTML = renderBid(cur.q, cur.f);
    if ($('#tQ')) $('#tQ').value = cur.q;
    if ($('#tF')) $('#tF').value = Math.min(6, cur.f + 1);
    if ($('#tFb')) $('#tFb').innerHTML = '';
    updateSettingsHint();
    updateStat();
  }
  function updateSettingsHint() {
    const el = $('#tSettingsHint');
    if (!el) return;
    const mk = $('#tMode').value;
    const m = MODES[mk];
    const thr = (+$('#tT').value || 0.5).toFixed(2);
    const shortName = m.name.split('(')[0].trim();
    el.textContent = `${shortName} · порог ${thr}`;
  }

  function bestRaiseThreshold() {
    if (!cur) return null;
    return bestSafeRaise(
      { q: cur.q, f: cur.f }, cur.n, cur.h,
      { wild: cur.m.wild }, +$('#tT').value
    );
  }

  function hint() {
    const b = bestRaiseThreshold();
    return b
      ? `<p class="m">Самая сильная безопасная ставка: ${renderBid(b.q, b.f)} (${pct(b.p)}).</p>`
      : '<p class="m">Безопасных повышений выше порога нет — «Не верю» часто лучший выбор.</p>';
  }

  function answer(good, html) {
    if (answered || !cur) return;
    answered = true;

    const mk = $('#tMode').value;
    S.n++;
    S.byMode[mk] = S.byMode[mk] || { n: 0, good: 0 };
    S.byMode[mk].n++;
    if (good) { S.good++; S.byMode[mk].good++; }

    if (cur.item) {
      if (good) {
        cur.item.streak = (cur.item.streak || 0) + 1;
        if (cur.item.streak >= 2) queue = queue.filter((x) => x !== cur.item);
      } else {
        cur.item.streak = 0;
      }
    } else if (!good) {
      queue.push({ mode: mk, n: cur.n, h: cur.h.slice(), f: cur.f, q: cur.q, streak: 0 });
    }

    persist();
    if ($('#tFb')) {
      $('#tFb').innerHTML =
        `<div class="big ${good ? 'g' : 'r'}">${good ? '✓ Хорошее решение' : '✗ Сомнительное решение'}</div>${html}`;
    }
  }

  const dudoBtn = $('#tDudo');
  if (dudoBtn) dudoBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const p = P.probBid(q, f, n, h, m.wild);
    const msg = p < t ? 'Ставка слишком смелая — «Не верю» оправдано.'
      : 'Ставка вероятна — лучше было верить и повышать.';
    answer(p < t, `<p>Шанс, что ставка ${renderBid(q, f)} верна: <b>${pct(p)}</b> (порог ${pct(t)}). ${msg}</p>${hint()}`);
  };

  const raiseBtn = $('#tRaise');
  if (raiseBtn) raiseBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const Q = +$('#tQ').value;
    const F = +$('#tF').value;

    if (!(Q > q || (Q === q && F > f))) {
      flash($('#tFb'), 'Ставка должна быть выше: больше количество или та же цифра и больше значение.');
      return;
    }
    if (Q > n) { flash($('#tFb'), 'Ставка больше общего числа кубиков.'); return; }

    const p = P.probBid(Q, F, n, h, m.wild);
    const po = P.probBid(q, f, n, h, m.wild);
    answer(p >= t,
      `<p>Ваша ставка ${renderBid(Q, F)} верна с шансом <b>${pct(p)}</b> (порог ${pct(t)}). ` +
      `Ставка соперника была верна с шансом ${pct(po)}.</p>${hint()}`
    );
  };

  if ($('#tNew')) $('#tNew').onclick = newSituation;

  if ($('#tMode')) {
    $('#tMode').onchange = () => {
      updateSettingsHint();   // ← сначала обновляем подпись
      newSituation();          // ← потом генерируем новую ситуацию
    };
  }

  if ($('#tT')) {
    $('#tT').addEventListener('input', updateSettingsHint);
  }
  if ($('#tReset')) $('#tReset').onclick = () => {
    S.n = 0; S.good = 0; S.byMode = {};
    S.drill = { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };
    queue = [];
    persist();
    newSituation();
  };

  newSituation();
}

// ================= Упражнения =================

let drillState = { A: null, B: null };

function setupDrill() {
  if (!P) return;

  const S = getStats();
  S.drill = S.drill || { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };

  function saveDrill(k, good) {
    S.drill[k].n++;
    if (good) S.drill[k].good++;
    setStats(S);
  }

  function newA() {
    const n = P.ri(8, 30);
    const k = P.ri(1, 5);
    const h = P.roll(k);
    const f = P.ri(1, 6);
    drillState.A = { n, h, f };
    if ($('#dAq')) {
      $('#dAq').innerHTML =
        `Всего кубиков: <b>${n}</b>, единицы — джокеры. Ваши: ${renderHand(h, true)} Цифра: ${renderDie(f, 's')}`;
    }
    if ($('#dA1')) $('#dA1').value = '';
    if ($('#dA2')) $('#dA2').value = '';
    if ($('#dAfb')) $('#dAfb').innerHTML = '';
  }

  function newB() {
    const down = Math.random() < 0.5;
    const q = P.ri(3, 16);
    const f = P.ri(2, 6);
    drillState.B = { down, q, f };
    if ($('#dBq')) {
      $('#dBq').innerHTML = down
        ? `Текущая ставка ${renderBid(q, f)}. Какое <b>минимальное</b> количество единиц можно назвать?`
        : `Текущая ставка ${renderBid(q, 1)} (единицы). Какое <b>минимальное</b> количество обычной цифры можно назвать?`;
    }
    if ($('#dB1')) $('#dB1').value = '';
    if ($('#dBfb')) $('#dBfb').innerHTML = '';
  }

  const checkA = $('#dACheck');
  if (checkA) checkA.onclick = () => {
    const d = drillState.A;
    if (!d) return;
    const { n, h, f } = d;
    const unk = n - h.length;
    const ownCnt = P.own(h, f, true);
    const pv = f === 1 ? 1 / 6 : 1 / 3;
    const exp = ownCnt + unk * pv;
    const safe = P.bestBid(f, n, h, true, 0.5);
    const pSafe = safe > 0 ? P.probBid(safe, f, n, h, true) : 0;
    const pSafe1 = safe + 1 > 0 ? P.probBid(safe + 1, f, n, h, true) : 0;

    const a1 = parseFloat(String($('#dA1').value).replace(',', '.'));
    const a2 = parseFloat($('#dA2').value);
    const ok1 = Math.abs(a1 - exp) <= 0.75;
    const ok2 = Math.abs(a2 - safe) <= 1;

    saveDrill('A', ok1 && ok2);

    if ($('#dAfb')) {
      const faceNote = f === 1
        ? '1/6 (грань 1 — без джокеров)'
        : `1/3 (грань ${f} + 1-джокер)`;

      $('#dAfb').innerHTML =
        `<p class="${ok1 ? 'g' : 'r'}">Ожидание: ${isNaN(a1) ? '—' : a1} → точное ${exp.toFixed(1)} = ` +
        `${ownCnt} (ваши, с джокерами) + ${unk} × ${f === 1 ? '1/6' : '1/3'}.</p>` +
        `<p class="${ok2 ? 'g' : 'r'}">Безопасная ставка (шанс ≥ 50%): ваш ответ ${isNaN(a2) ? '—' : a2}, точно ${safe} ` +
        `(${pct(pSafe)}). Допуск ±1 — это тренировка прикидки в уме.</p>` +

        `<details class="calc-hint">` +
        `<summary>Как это посчитано</summary>` +
        `<div class="calc-hint-body">` +

        `<p><b>1. Ожидание (среднее количество кубиков нужной цифры на столе).</b><br>` +
        `E[X] = «ваши» + неизвестные × p.<br>` +
        `• «ваши» = ${ownCnt} — кубики в руке, совпадающие с гранью ` +
        `${f === 1 ? '1 напрямую' : `«${f}» или с 1-джокером`}.<br>` +
        `• неизвестные = ${n} − ${h.length} = ${unk}.<br>` +
        `• p = ${pv.toFixed(4)} для грани «${f}»: ${faceNote}.<br>` +
        `E[X] = ${ownCnt} + ${unk} × ${pv.toFixed(4)} ≈ <b>${exp.toFixed(2)}</b>.</p>` +

        `<p><b>2. Безопасная ставка.</b><br>` +
        `Нужно наибольшее q, при котором P(X ≥ q) ≥ 0.5. Здесь X ~ Binomial(${unk}, ${pv.toFixed(4)}).<br>` +
        `Вместо «сколько всего» удобнее считать «сколько должно добавиться из неизвестных»:<br>` +
        `need = q − «ваши» = q − ${ownCnt}.<br>` +
        `P(X ≥ need) = Σ<sub>k = need</sub><sup>${unk}</sup> C(${unk}, k) · p<sup>k</sup> · (1 − p)<sup>${unk} − k</sup>.</p>` +

        `<p>Проверяем два соседних значения:<br>` +
        `• q = ${safe}: P ≈ <b>${pct(pSafe)}</b> ≥ 50% ✔<br>` +
        `• q = ${safe + 1}: P ≈ <b>${pct(pSafe1)}</b> &lt; 50% ✘<br>` +
        `Значит, безопасная ставка — <b>${safe}</b>.</p>` +

        `<p class="m">Замечание: E[X] и «безопасная ставка» — разные величины. ` +
        `E[X] — среднее, а 50%-й порог лежит <i>ниже</i> среднего, потому что биномиальное ` +
        `распределение скошено вправо. Отсюда правило: безопасная ставка обычно на 1–2 меньше E[X].</p>` +

        `</div>` +
        `</details>`;
    }
  };

  /* ============================================================
   Табы A/B — переключение между панелями без скролла.
   Раньше это делали две кнопки #dANew и #dBNew (каждая со своей
   панелью). Теперь одна кнопка #dNew + переключатель.
   ============================================================ */
  let activeDrill = 'A';

  document.querySelectorAll('.drill-tab').forEach((btn) => {
    btn.onclick = () => {
      activeDrill = btn.dataset.drill;   // 'A' или 'B'
      document.querySelectorAll('.drill-tab').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const panelA = $('#dPanelA');
      const panelB = $('#dPanelB');
      if (panelA) panelA.classList.toggle('hide', activeDrill !== 'A');
      if (panelB) panelB.classList.toggle('hide', activeDrill !== 'B');
    };
  });

  const checkB = $('#dBCheck');
  if (checkB) checkB.onclick = () => {
    const d = drillState.B;
    if (!d) return;
    const exp = d.down ? Math.ceil(d.q / 2) : d.q * 2 + 1;
    const a = parseInt($('#dB1').value, 10);
    const ok = a === exp;
    saveDrill('B', ok);

    if ($('#dBfb')) {
      $('#dBfb').innerHTML =
        `<p class="${ok ? 'g' : 'r'}">${ok ? 'Верно' : 'Неверно'}: ` +
        (d.down
          ? `с обычной цифры на единицы — половина ставки с округлением вверх: ⌈${d.q}/2⌉ = ${exp}`
          : `с единиц на обычную цифру — больше удвоенного: ${d.q}×2+1 = ${exp}`) +
        '.</p>' +

        `<details class="calc-hint">` +
        `<summary>Как это посчитано</summary>` +
        `<div class="calc-hint-body">` +
        (d.down
          ? `<p>Ставка на <b>обычную цифру</b> q = ${d.q}.<br>` +
          `Единица встречается в 2 раза реже: 1/6 против 1/3 (последнее — потому что «1/3» ` +
          `для обычной цифры учитывает 1-джокер: грань f + грань 1).<br>` +
          `Чтобы ожидаемое количество совпало, количество ставки нужно примерно вдвое уменьшить, ` +
          `а округление — вверх, чтобы не потерять вероятность:<br>` +
          `⌈${d.q} / 2⌉ = <b>${exp}</b>.</p>`
          : `<p>Ставка на <b>единицы</b> q = ${d.q}.<br>` +
          `Обратный переход: на обычной цифре вероятность на кубик вдвое выше, ` +
          `но ставка должна быть строго «безопаснее» исходной.<br>` +
          `Условие: ⌈q<sub>normal</sub> / 2⌉ &gt; ${d.q}.<br>` +
          `Отсюда q<sub>normal</sub> / 2 &gt; ${d.q} ⇒ q<sub>normal</sub> &gt; ${d.q} × 2 ⇒ ` +
          `наименьшее целое = <b>${d.q} × 2 + 1 = ${exp}</b>.</p>`) +
        `</div>` +
        `</details>`;
    }
  };

  // Одна кнопка «Новое» — работает для активного таба
  const newBtn = $('#dNew');
  if (newBtn) {
    newBtn.onclick = () => {
      if (activeDrill === 'A') newA();
      else newB();
    };
  }

  newA();
  newB();
}

// ================= Партия (движок + стол) =================

let game = null;
let gameLogEntries = [];
let reviewEntries = [];
let selectedFace = 2;
let botTimer = null;
let lastBidKey = '';
let lastLoggedRound = 0;

function setupGame() {
  $$('[data-action="new-game"]').forEach((b) => { b.onclick = startNewGame; });
  if ($('#gDudo')) $('#gDudo').onclick = onPlayerDudo;
  if ($('#gCalza')) $('#gCalza').onclick = onPlayerCalza;
  if ($('#gRaise')) $('#gRaise').onclick = onPlayerRaise;
  if ($('#gMinus')) $('#gMinus').onclick = () => {
    $('#gQ').value = Math.max(1, +$('#gQ').value - 1);
    renderPick();
  };
  if ($('#gPlus')) $('#gPlus').onclick = () => {
    const total = totalDice();
    $('#gQ').value = Math.min(total, +$('#gQ').value + 1);
    renderPick();
  };
  if ($('#gQ')) $('#gQ').oninput = () => { renderPick(); renderPractical(); };
  // На телефоне количество меняется кнопками «−/+»: системная клавиатура
  // закрыла бы панель действий.
  if ($('#gQ') && window.matchMedia?.('(pointer: coarse)').matches) $('#gQ').readOnly = true;

  startNewGame();
}

function totalDice() {
  if (!game) return 0;
  return game.players.reduce((s, p) => s + Math.max(0, p.dice || 0), 0);
}

function startNewGame() {
  clearTimeout(botTimer);
  if (!P) return;

  const botCount = Math.max(1, Math.min(5, +($('#gBots')?.value || 3)));
  const startDice = Math.max(1, Math.min(10, +($('#gDice')?.value || 5)));
  const calzaEnabled = !!$('#gCalzaOpt')?.checked;
  const palificoEnabled = !!$('#gPalificoOpt')?.checked;
  const assistMode = $('#gAssist')?.value || 'training';
  const botSpeed = $('#gSpeed')?.value || 'normal';

  assistConfig = createAssistConfig(assistMode);

  const characters = [];
  const stylesOrder = ['careful', 'bluffer', 'smart'];
  for (let i = 0; i < botCount; i++) characters.push(generateCharacter(stylesOrder[i % 3]));

  game = createGame({
    playerId: 'human',
    botCount,
    startDice,
    calzaEnabled,
    palificoEnabled,
    assistMode,
    botSpeed,
    botNames: characters.map((c) => c.name),
  });

  for (let i = 0; i < botCount; i++) {
    const bot = game.players[i + 1];
    if (!bot) continue;
    bot.character = characters[i];
    bot.style = characters[i].style;
    bot.gender = characters[i].gender;
    bot.avatar = characters[i].avatar;
  }

  gameLogEntries = [];
  reviewEntries = [];
  lastBidKey = '';
  lastLoggedRound = 0;

  startGame(game);

  addGameLog('info', `Партия началась: ${botCount + 1} игроков, по ${startDice} кубиков.` +
    (calzaEnabled ? ' Calza включён.' : '') +
    (palificoEnabled ? ' Палифико включён.' : ''));

  renderGame();
  if (game.state === 'active' && game.currentPlayer !== 0) scheduleBotTurn();
}

// ----- Журнал и разбор -----

function addGameLog(type, html) {
  gameLogEntries.push({ type, html, round: game ? game.round : 0 });
  const el = $('#gHistory');
  if (el) {
    el.innerHTML = gameLogEntries
      .map((e) => {
        const cls = e.type === 'dudo' ? 'dudo' : e.type === 'rh' ? 'rh' : '';
        return `<div class="log-row ${cls}">${e.html}</div>`;
      })
      .join('');
    el.scrollTop = el.scrollHeight;
  }
  const feed = $('#gFeed');
  if (feed) feed.innerHTML = html;
}

function addReview(kind, prob, text) {
  const v = getClassification(prob, kind);
  const entry = { kind, prob, text, v, round: game ? game.round : 0, outcome: '' };
  reviewEntries.push(entry);
  return entry;
}

function renderReview() {
  const el = $('#gReview');
  if (!el) return;
  if (!reviewEntries.length) {
    el.innerHTML = '<span class="m">Здесь появится оценка ваших ходов.</span>';
    return;
  }
  el.innerHTML = reviewEntries.map((e) => `
    <div class="rv ${e.v.code}">
      <span class="bd">${e.v.code === 'good' ? '✓' : e.v.code === 'meh' ? '~' : '✗'}</span>
      <div>
        <b>Раунд ${e.round}.</b> ${e.text}
        ${e.outcome ? `<div class="m">${e.outcome}</div>` : ''}
      </div>
    </div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

// ----- Рендер -----

function gameViewForRender() {
  return {
    round: game.round,
    palifico: game.palifico,
    bid: game.bid,
    players: game.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      dice: p.dice,
      alive: p.alive,
      isHuman: i === 0,
      isBot: p.isBot,
      hand: p.hand || [],
      style: p.style,
      avatar: p.avatar,
      gender: p.gender,
      lastBid: (game.bid && game.bid.playerId === p.id)
        ? { q: game.bid.q, f: game.bid.f }
        : null,
    })),
  };
}

/* P1.5: прямой совет для режима «Новичок».
   Появляется только когда assistConfig.showDirectAdvice === true.
   В режиме «Игра» блок пуст — там стратегических подсказок быть не должно. */
function renderAdvice() {
  const el = $('#gAdvice');
  if (!el) return;

  if (!game || game.state !== 'active' || !assistConfig.showDirectAdvice) {
    el.innerHTML = '';
    return;
  }

  const me = game.players[0];
  if (!me.alive || game.currentPlayer !== 0) { el.innerHTML = ''; return; }

  const total = totalDice();
  const b = game.bid;
  const wild = !game.palifico;
  let html = '';

  // Единственная подсказка, которая осталась здесь — Dudo или Raise.
  if (b && b.playerId !== 'human') {
    const p = P.probBid(b.q, b.f, total, me.hand, wild);
    if (p < 0.5) {
      html += `<div class="advice good">💡 Лучше сказать «Не верю»: ставка ${renderBid(b.q, b.f)} верна лишь в ${pct(p)}.</div>`;
    } else {
      html += `<div class="advice">💡 Ставка вероятна (${pct(p)}) — лучше повысить.</div>`;
    }
  }

  el.innerHTML = html;
}
/* Практический расчёт в уме — какие числа складывать, чтобы
   получить безопасную ставку. Показывается в Новичке и Тренировке,
   полностью скрыт в режиме «Игра». */
function renderPractical() {
  const el = $('#gPractical');
  if (!el) return;

  // В честном режиме не показываем ничего стратегического.
  // Берём showFutureBidOdds как маркер: он true в novice и training,
  // false в game (см. assist.js).
  if (!assistConfig.showFutureBidOdds) { el.innerHTML = ''; return; }

  if (!game || game.state !== 'active') { el.innerHTML = ''; return; }
  const me = game.players[0];
  if (!me.alive || game.currentPlayer !== 0) { el.innerHTML = ''; return; }

  const total = totalDice();
  const face = selectedFace;
  const wild = !game.palifico;

  const unknown = total - me.hand.length;
  const own = P.own(me.hand, face, wild);
  const p = P.pFace(face, wild);      // 1/3 для 2–6, 1/6 для 1 / Palifico
  const denom = (p === 1 / 3) ? 3 : 6;
  const third = unknown / denom;
  const E = own + third;

  // Округление: при большом столе — к ближайшему, при среднем — вниз.
  const safe = unknown >= 15 ? Math.round(E) : Math.floor(E);
  const pSafe = P.probBid(safe, face, total, me.hand, wild);

  // Пометка, что грань — единица или Palifico (нет джокеров)
  const wildNote = face === 1
    ? ' · грань 1, джокеры не считаются'
    : (game.palifico ? ' · Palifico, без джокеров' : '');

  el.innerHTML = `
    <div class="ph-title">🔢 Безопасная ставка — быстрый расчёт для грани ${face}${wildNote}</div>
    <div class="ph-grid">
      <div class="ph-row"><span>Всего кубиков на столе</span><span>${total}</span></div>
      <div class="ph-row"><span>Ваших в руке</span><span>${me.hand.length}</span></div>
      <div class="ph-row"><span>Неизвестных кубиков</span><span>${unknown}</span></div>
      <div class="ph-row ph-row-sep"><span>Своих «${face}» + джокеров</span><span>${own}</span></div>
      <div class="ph-row"><span>Неизвестные / ${denom}</span><span>${unknown} / ${denom} ≈ ${third.toFixed(1)}</span></div>
    </div>
    <div class="ph-total">Безопасная ставка (грань ${face}) ≈ <b>${safe}</b></div>
    <div class="ph-note">
      ${own} + ${third.toFixed(1)} = ${E.toFixed(1)} → округляем до ${safe}.
      Шанс, что ${safe}×${face} верна: <b>${pct(pSafe)}</b>.
      ${assistConfig.showDirectAdvice
      ? `<br>Формула: E[X] = свои + неизвестные × ${p === 1 / 3 ? '1/3' : '1/6'}.`
      : ''}
    </div>
  `;
}

function renderGame() {
  if (!game) return;

  if (game.round > lastLoggedRound) {
    lastLoggedRound = game.round;
    if (game.round > 1) {
      const totalNow = totalDice();
      const starterName = game.players[game.currentPlayer]?.name || '';
      addGameLog('rh',
        `— Раунд ${game.round} · кубиков на столе: ${totalNow} · начинает: ${starterName}` +
        (game.palifico ? ' · ПАЛИФИКО' : '') + ' —');
    }
  }

  const tableEl = $('#gameTable');
  if (tableEl) {
    tableEl.innerHTML = renderTable(gameViewForRender(), game.currentPlayer);
  }

  const me = game.players[0];
  const total = totalDice();
  const aliveCnt = game.players.filter((p) => p.alive).length;

  if ($('#gStatus')) {
    let txt;
    if (game.state === 'finished') {
      txt = me.alive && aliveCnt === 1 ? '🏆 Вы выиграли партию!' : '🏁 Партия завершена.';
    } else if (!me.alive) {
      txt = 'Вы выбыли, партия идёт без вас…';
    } else if (game.currentPlayer === 0) {
      txt = 'Ваш ход';
    } else {
      txt = `Ходит: <span class="c${game.currentPlayer}">${game.players[game.currentPlayer].name}</span>`;
    }
    $('#gStatus').innerHTML = txt;
  }

  if ($('#gMeta')) {
    $('#gMeta').innerHTML =
      `Раунд ${game.round} · 🎲 ${total}` +
      (game.palifico ? ' · <b class="warn">ПАЛИФИКО</b>' : '');
  }

  if ($('#gHand')) $('#gHand').innerHTML = renderHand(me.hand, !game.palifico);

  const oddsEl = $('#gDudoOdds');
  if (oddsEl) {
    const b = game.bid;
    oddsEl.textContent = (assistConfig.showCurrentBidOdds && b && b.playerId !== 'human' && me.alive)
      ? `верна на ${pct(P.probBid(b.q, b.f, total, me.hand, !game.palifico))}`
      : '';
  }

  const dis = game.state !== 'active' || game.currentPlayer !== 0 || !me.alive;

  if ($('#gDudo')) {
    $('#gDudo').disabled = dis || !game.bid || game.bid.playerId === 'human';
  }

  if ($('#gCalza')) {
    // P0.4: используем единое условие из движка.
    const calzaAvailable = engineCanCalza(game) && game.bid && game.bid.playerId !== 'human';
    $('#gCalza').disabled = dis || !calzaAvailable;
    $('#gCalza').classList.toggle('hide', !game.calzaEnabled);
  }

  ['#gRaise', '#gQ', '#gMinus', '#gPlus'].forEach((s) => {
    const el = $(s);
    if (el) el.disabled = dis;
  });
  $('#gDock')?.classList.toggle('is-waiting', dis);

  // Новый раунд: сначала выбираем минимальную легальную ставку,
  // и только затем строим кнопки граней по актуальному selectedFace.
  const bidKey = `${game.round}:${game.bid ? `${game.bid.q}x${game.bid.f}` : '-'}`;
  if (bidKey !== lastBidKey) {
    lastBidKey = bidKey;
    resetBidInput();
  }

  const pick = $('#gPick');
  if (pick) {
    pick.innerHTML = '';
    for (let f = 1; f <= 6; f++) {
      const b = document.createElement('button');
      b.className = 'pf' + (f === selectedFace ? ' sel' : '');
      b.innerHTML = renderDie(f, 's');
      // legal() не убывает по количеству: если нет допустимой ставки на
      // total кубиков, то нет её и на меньшее количество.
      b.disabled = dis || !legal(total, f, game.bid, { wild: !game.palifico });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Цифра ${f}`);
      b.setAttribute('aria-checked', String(f === selectedFace));
      b.onclick = () => {
        selectedFace = f;
        renderGame();
      };
      pick.append(b);
    }
  }

  // Ручной выбор грани не должен принудительно заменяться автоматической нормализацией.
  updatePrev();
  renderAdvice();
  renderPractical();
  renderReview();

  if (game.state === 'finished') finalizeGame();
}

function renderPick() { updatePrev(); }

function resetBidInput() {
  if (!game) return;
  const total = totalDice();
  const m = minLegal(game.bid, total, { wild: !game.palifico });
  if (m) {
    if ($('#gQ')) $('#gQ').value = m.q;
    selectedFace = m.f;
  }
}

function ensureLegalBidInput() {
  if (!game || game.currentPlayer !== 0) return;
  const total = totalDice();
  const q = +($('#gQ')?.value || 1);
  const f = selectedFace;
  if (!legal(q, f, game.bid, { wild: !game.palifico })) {
    const m = minLegal(game.bid, total, { wild: !game.palifico });
    if (m) {
      if ($('#gQ')) $('#gQ').value = m.q;
      selectedFace = m.f;
    }
  }
}

function updatePrev() {
  const err = $('#gPrev');
  if (err) err.innerHTML = '';

  const raise = $('#gRaise');
  if (!raise) return;

  const myTurn = game && game.state === 'active'
    && game.currentPlayer === 0 && game.players[0].alive;
  if (!myTurn) {                      // disabled уже выставлен в renderGame
    raise.innerHTML = '<span class="btn-main">Ставлю</span>';
    return;
  }

  const total = totalDice();
  const q = +($('#gQ')?.value || 1);
  const f = selectedFace;
  const ok = legal(q, f, game.bid, { wild: !game.palifico });

  raise.disabled = !ok;
  if (!ok) {
    const why = game.palifico ? 'та же цифра' : 'слишком мало';
    raise.innerHTML = `<span class="btn-main">Ставлю ${q}×${f}</span><span class="btn-sub">${why}</span>`;
    return;
  }

  const me = game.players[0];
  const p = P.probBid(q, f, total, me.hand, !game.palifico);
  const odds = assistConfig.showFutureBidOdds
    ? `<span class="btn-sub">шанс ${pct(p)}</span>` : '';
  raise.innerHTML = `<span class="btn-main">Ставлю ${q}×${f}</span>${odds}`;
}

// ----- Ходы игрока -----

function onPlayerRaise() {
  if (!game || game.state !== 'active' || game.currentPlayer !== 0) return;
  const total = totalDice();
  const q = +$('#gQ').value;
  const f = selectedFace;
  const me = game.players[0];

  if (!legal(q, f, game.bid, { wild: !game.palifico })) {
    flash($('#gPrev'), 'Ставка недопустима.');
    return;
  }

  const p = P.probBid(q, f, total, me.hand, !game.palifico);
  addReview('raise', p, `вы поставили ${renderBid(q, f)} — шанс ${pct(p)}.`);

  const res = applyAction(game, 'human', { type: 'raise', quantity: q, face: f });
  if (!res.success) {
    reviewEntries.pop();
    flash($('#gPrev'), `Ставка отклонена: ${res.error}`);
    return;
  }

  addGameLog('', `<span class="pn c0">Вы</span> ${renderBid(q, f)}`);
  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  if (game.state === 'active' && game.currentPlayer !== 0) scheduleBotTurn();
}

function onPlayerDudo() {
  if (!game || game.state !== 'active' || game.currentPlayer !== 0) return;
  const b = game.bid;
  if (!b || b.playerId === 'human') return;

  const total = totalDice();
  const me = game.players[0];
  const q = b.q, f = b.f;
  const p = P.probBid(q, f, total, me.hand, !game.palifico);
  const entry = addReview('dudo', p,
    `вы не поверили ${renderBid(q, f)} — шанс, что ставка верна: ${pct(p)}.`);

  const res = applyAction(game, 'human', { type: 'dudo' });
  if (!res.success) { reviewEntries.pop(); return; }

  const revealed = res.events.find((e) => e.type === 'DICE_REVEALED');
  if (revealed) {
    entry.outcome = `На столе было ${revealed.actualCount} при ставке ${q} — ` +
      (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.';
  }

  addGameLog('dudo', `<b class="r">НЕ ВЕРЮ</b> (${renderBid(q, f)})`);
  if (revealed) {
    addGameLog('rh',
      `Проверка: на столе ${revealed.actualCount} из ${q} — ` +
      (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.');
  }

  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  if (game.state === 'active' && game.currentPlayer !== 0) scheduleBotTurn();
}

function onPlayerCalza() {
  if (!game || game.state !== 'active' || game.currentPlayer !== 0) return;
  const b = game.bid;
  if (!b || b.playerId === 'human' || !game.calzaEnabled) return;

  const total = totalDice();
  const me = game.players[0];
  const q = b.q, f = b.f;
  const pe = P.exactProb(q, f, total, me.hand, !game.palifico);
  const entry = addReview('calza', pe,
    `вы сказали Calza на ${renderBid(q, f)} — шанс точного совпадения ${pct(pe)}.`);

  const res = applyAction(game, 'human', { type: 'calza' });
  if (!res.success) { reviewEntries.pop(); return; }

  const revealed = res.events.find((e) => e.type === 'DICE_REVEALED');
  if (revealed) {
    entry.outcome = `На столе ${revealed.actualCount} при ставке ${q} — ` +
      (revealed.calzaExact ? 'точно' : 'мимо') + '.';
  }

  addGameLog('dudo', `<b class="warn">CALZA</b> (${renderBid(q, f)})`);
  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  if (game.state === 'active' && game.currentPlayer !== 0) scheduleBotTurn();
}

// ----- Ход бота -----

function scheduleBotTurn() {
  clearTimeout(botTimer);
  if (!game || game.state !== 'active') return;
  if (game.currentPlayer === 0) return;

  const speed = $('#gSpeed')?.value || 'normal';
  const delays = { step: 700, slow: 2600, normal: 1100, fast: 320 };
  const delay = delays[speed] ?? 1100;
  const snapshot = game;
  botTimer = setTimeout(() => {
    if (game === snapshot) runBotTurn();
  }, delay);
}

function runBotTurn() {
  if (!game || game.state !== 'active') return;
  if (game.currentPlayer === 0) return;

  const idx = game.currentPlayer;
  const bot = game.players[idx];
  const total = totalDice();

  const opps = game.players
    .map((p, i) => ({ k: p.dice, faces: [], isSelf: i === idx }))
    .filter((o) => !o.isSelf && o.k > 0)
    .map(({ k, faces }) => ({ k, faces }));

  let decision;
  try {
    decision = botDecide({
      hand: bot.hand,
      publicState: { totalDice: total },
      bid: game.bid ? { q: game.bid.q, f: game.bid.f } : null,
      rules: { wild: !game.palifico },
      style: BOT_STYLES[bot.style] || BOT_STYLES.smart,
      opps,
      canCalza: game.calzaEnabled && !!game.bid && game.bid.playerId !== bot.id && engineCanCalza(game),
    });
  } catch (e) {
    console.warn('botDecide failed, fallback to dudo/min-raise:', e);
    decision = game.bid
      ? { type: 'dudo' }
      : { type: 'raise', ...minLegal(null, total, { wild: !game.palifico }) };
  }

  let action;
  if (decision.type === 'raise') action = { type: 'raise', quantity: decision.q, face: decision.f };
  else if (decision.type === 'calza') action = { type: 'calza' };
  else action = { type: 'dudo' };

  const res = applyAction(game, bot.id, action);

  if (!res.success) {
    let fallback;
    if (game.bid && game.bid.playerId !== bot.id) {
      fallback = { type: 'dudo' };
    } else {
      const m = minLegal(game.bid, total, { wild: !game.palifico });
      fallback = m ? { type: 'raise', quantity: m.q, face: m.f } : { type: 'dudo' };
    }
    const res2 = applyAction(game, bot.id, fallback);
    if (!res2.success) { console.error('Bot fallback also failed:', res2.error); return; }
    action = fallback;
  }

  let desc;
  if (action.type === 'raise') desc = renderBid(action.quantity, action.face);
  else if (action.type === 'dudo') desc = '<b class="r">НЕ ВЕРЮ</b>';
  else desc = '<b class="warn">CALZA</b>';
  addGameLog('', `<span class="pn c${idx}">${bot.name}</span> ${desc}`);

  if (action.type === 'dudo') {
    const revealed = res.events.find((e) => e.type === 'DICE_REVEALED');
    if (revealed) {
      const bidQ = revealed.bid?.q ?? revealed.bid?.quantity;
      addGameLog('rh',
        `Проверка: на столе ${revealed.actualCount} из ${bidQ} — ` +
        (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.');
    }
  }

  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  if (game.state === 'active' && game.currentPlayer !== 0) scheduleBotTurn();
}

// ----- Финализация -----

function finalizeGame() {
  if (!game) return;

  const me = game.players[0];
  const aliveCnt = game.players.filter((p) => p.alive).length;
  const won = me.alive && aliveCnt === 1;

  const history = get('perudo.games', []);
  history.push({
    ts: Date.now(),
    players: game.players.length,
    startDice: game.config.startDice,
    rounds: game.round,
    won,
    decisions: reviewEntries.length,
    assistMode: game.config.assistMode,
    calza: !!game.config.calzaEnabled,
    palifico: !!game.config.palificoEnabled,
  });
  set('perudo.games', history.slice(-200));

  const stats = getStats();
  stats.totalGames = (stats.totalGames || 0) + 1;
  if (won) stats.totalWins = (stats.totalWins || 0) + 1;
  setStats(stats);

  const el = $('#gSummary');
  if (!el) return;

  const good = reviewEntries.filter((e) => e.v.code === 'good').length;
  const meh = reviewEntries.filter((e) => e.v.code === 'meh').length;
  const bad = reviewEntries.filter((e) => e.v.code === 'bad').length;
  const acc = reviewEntries.length ? (good + 0.5 * meh) / reviewEntries.length : null;

  el.innerHTML = `
    <div class="card">
      <b>Итог партии: ${won ? 'победа 🏆' : 'поражение'}</b>
      <p>Решений: ${reviewEntries.length}. Точность по модели: <b>${acc == null ? '—' : pct(acc)}</b>.</p>
      <table>
        <tr><th></th><th>✓ верно</th><th>~ спорно</th><th>✗ ошибка</th></tr>
        <tr><td>Решения</td><td>${good}</td><td>${meh}</td><td>${bad}</td></tr>
      </table>
    </div>
  `;
}

// ================= Дуэль (CFR) =================

let duelTree = null;
let duelState = null;
let duelStats = get('perudo.duelStats', { games: 0, wins: 0, moves: 0, dev: 0 });

function setupDuel() {
  if (!P) return;
  if ($('#dSolve')) $('#dSolve').onclick = () => solveNow();
  if ($('#dStart')) $('#dStart').onclick = () => startDuel();
}

function solveNow(cb) {
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
      t += `<td style="background:rgba(110,168,254,${Math.min(0.9, v * 1.2).toFixed(2)})">${v >= 0.01 ? (v * 100).toFixed(0) + '%' : ''}</td>`;
    }
    t += '</tr>';
  }
  el.innerHTML = '<p class="m">Оптимальные частоты первой ставки в зависимости от вашего кубика:</p>' + t + '</table>';
}

function startDuel() {
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
      D.log.push(`<div class="log-row"><span class="pn c1">Бот</span> <b class="r">не верит!</b></div>`);
      endDuel(node.p, node);
      return;
    }
    D.log.push(`<div class="log-row"><span class="pn c1">Бот</span> ${renderBid(act.q, act.f)}</div>`);
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
  set('perudo.duelStats', duelStats);

  D.result = `Проверка ${renderBid(q, f)}: вместе <b>${c}</b>. ` +
    (meWin ? '<b class="g">Вы выиграли раунд 🎉</b>' : '<b class="r">Вы проиграли раунд</b>') +
    `. Ваш кубик: ${renderDie(D.hs[D.role] + 1, 'xs', D.hs[D.role] === 0)}, ` +
    `кубик бота: ${renderDie(D.hs[1 - D.role] + 1, 'xs', D.hs[1 - D.role] === 0)}.`;
}

function renderDuel() {
  const el = $('#dPlay');
  if (!el || !duelState) return;
  const D = duelState;
  const my = D.hs[D.role];

  let html = `<div>Ваш кубик: ${renderDie(my + 1, '', my === 0)} ` +
    `<span class="m">· вы ${D.role === 0 ? 'открываете' : 'отвечаете'}</span></div>` +
    `<div style="margin:8px 0">${D.log.join('') || '<span class="m">Ставок ещё нет</span>'}</div>`;

  if (D.over) {
    html += `<p>${D.result}</p>`;
  } else {
    html += '<div class="row">' + D.node.acts.map((a, i) =>
      `<button data-i="${i}" class="${a === 'D' ? 'bad' : ''}">${a === 'D' ? 'Не верю!' : a.q + ' × ' + a.f
      }</button>`).join('') + '</div>';
  }

  html += `<div class="m" style="margin-top:6px">${D.fb || ''}</div>` +
    `<p class="m">Сессия: партий ${duelStats.games}, побед ${duelStats.wins}; ` +
    `редких отклонений от оптимума: ${duelStats.dev} из ${duelStats.moves}.</p>`;

  el.innerHTML = html;

  el.querySelectorAll('button[data-i]').forEach((b) => {
    b.onclick = () => moveDuel(+b.dataset.i);
  });
}

function moveDuel(i) {
  const D = duelState;
  if (!D || D.over) return;
  const node = D.node;
  const act = node.acts[i];
  const my = D.hs[D.role];
  const pr = node.avg[my][i];

  duelStats.moves++;
  if (pr < 0.05) duelStats.dev++;
  set('perudo.duelStats', duelStats);

  D.fb = `Ваш ход ${act === 'D' ? '«Не верю»' : act.q + '×' + act.f}: оптимальная частота ` +
    `${(pr * 100).toFixed(0)}% ${pr < 0.05 ? '<b class="r">— редкое отклонение</b>' : '<b class="g">— в рамках</b>'}.`;

  if (act === 'D') {
    D.log.push(`<div class="log-row"><span class="pn c0">Вы</span> <b class="r">не верю!</b></div>`);
    endDuel(D.role, node);
    renderDuel();
    return;
  }

  D.log.push(`<div class="log-row"><span class="pn c0">Вы</span> ${renderBid(act.q, act.f)}</div>`);
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

// ================= Статистика =================

function renderStats() {
  if (!P) return;

  const stats = getStats();
  const history = getGames();          // P2.11: через storage-хелпер
  const queue = getTrainingQueue();

  if ($('#stTotal')) $('#stTotal').textContent = stats.n || 0;
  if ($('#stGood')) $('#stGood').textContent = stats.good || 0;
  if ($('#stQueue')) $('#stQueue').textContent = queue.length;

  const byModeEl = $('#stByMode');
  if (byModeEl) {
    const byMode = stats.byMode || {};
    const keys = Object.keys(byMode);
    if (!keys.length) {
      byModeEl.innerHTML = '<p class="m">Тренажёр ещё не использовался.</p>';
    } else {
      let h = '<table><tr><th>Режим</th><th>Всего</th><th>Верно</th><th>Процент</th></tr>';
      for (const k of keys) {
        const d = byMode[k];
        h += `<tr><td>${k}</td><td>${d.n}</td><td>${d.good}</td><td>${d.n ? pct(d.good / d.n) : '—'}</td></tr>`;
      }
      byModeEl.innerHTML = h + '</table>';
    }
  }

  const gamesEl = $('#stGames');
  if (gamesEl) {
    if (!history.length) {
      gamesEl.innerHTML = '<p class="m">Сыгранных партий пока нет.</p>';
    } else {
      const wins = history.filter((g) => g.won).length;
      let h = `<p>Сыграно: ${history.length}, побед: ${wins} (${pct(wins / history.length)}).</p>`;
      h += '<table><tr><th>Дата</th><th>Игроков</th><th>Раундов</th><th>Результат</th><th>Решений</th></tr>';
      h += history.slice(-15).reverse().map((g) =>
        `<tr><td>${new Date(g.ts).toLocaleString('ru')}</td><td>${g.players}</td><td>${g.rounds}</td>` +
        `<td>${g.won ? 'победа' : 'поражение'}</td><td>${g.decisions}</td></tr>`
      ).join('');
      h += '</table>';
      gamesEl.innerHTML = h;
    }
  }
}

function setupStats() {
  const exp = $('#stExport');
  if (exp) exp.onclick = () => {
    const data = {
      schemaVersion: 1,
      exportedAt: Date.now(),
      stats: getStats(),
      queue: getTrainingQueue(),
      games: getGames(),
      duel: duelStats,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perudo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clr = $('#stClear');
  if (clr) clr.onclick = () => {
    if (!confirm('Сбросить всю статистику, очередь и историю партий?')) return;
    try {
      ['perudo.settings', 'perudo.userProfile', 'perudo.games',
        'perudo.trainingQueue', 'perudo.duelStats'].forEach((k) => localStorage.removeItem(k));
    } catch (e) { }
    setStats({ n: 0, good: 0, totalGames: 0, totalWins: 0, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } });
    setTrainingQueue([]);
    set('perudo.games', []);
    set('perudo.duelStats', { games: 0, wins: 0, moves: 0, dev: 0 });
    duelStats = { games: 0, wins: 0, moves: 0, dev: 0 };
    renderStats();
  };
}

// ================= Симуляция =================

function setupSim() {
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

// ================= Точка входа =================

function bootstrap() {
  setupTabs();
  setupCalculator();
  setupTrainer();
  setupDrill();
  setupGame();
  setupDuel();
  setupStats();
  setupSim();
  renderStats();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

window.__perudo_v2 = {
  get game() { return game; },
  get duelTree() { return duelTree; },
  get duelState() { return duelState; },
  startNewGame,
  solveNow,
  startDuel,
  moveDuel,
};