// src/app_v2.js — точка входа Perudo Trainer v2
// ES-модуль. Работает и при прямом подключении, и после сборки build.py.

import { createGame, startGame, applyAction, canCalza as engineCanCalza }
  from './engine.js';
import { legal, minLegal } from './rules.js';
import { createAssistConfig, getClassification } from './assist.js';
import {
  getStats, setStats, updateStats, getBotMemory, setBotMemory,
  getTrainingQueue, setTrainingQueue, getGames,
  migrateIfNeeded, get, set,
} from './storage.js';
import {
  BOT_STYLES, BOT_STYLE_IDS, STYLE_AUTO, STYLE_RANDOM,
  generateCharacter, botDecide, pickBotStyles, noiseForLevel, DEFAULT_BOT_LEVEL,
} from './bots.js';
import {
  createMemory, normalizeMemory, observeEvent, opponentModel, describeMemory,
} from './memory.js';
import { renderTable, renderDie, renderHand, renderBid, escapeHtml } from './table.js';
import { buildGameResult, resultHeadline, pluralDice } from './result.js';
import { buildReveal, dieMatches } from './reveal.js';

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

/** Короткое название режима тренажёра: «Классика» из «Классика (5 кубиков у вас)». */
function modeLabel(key) {
  const m = MODES[key];
  return m ? m.name.split('(')[0].trim() : String(key);
}

// ================= Инициализация =================

migrateIfNeeded();

let assistConfig = createAssistConfig('training');

// ================= Вкладки =================

function setupTabs() {
  // Края ленты гаснут только там, где есть куда прокручивать
  const nav = $('.app-header nav');
  const updateFade = () => {
    if (!nav) return;
    const max = nav.scrollWidth - nav.clientWidth;
    nav.style.setProperty('--fade-l', nav.scrollLeft > 2 ? '24px' : '0px');
    nav.style.setProperty('--fade-r', nav.scrollLeft < max - 2 ? '24px' : '0px');
  };
  nav?.addEventListener('scroll', updateFade, { passive: true });
  window.addEventListener('resize', updateFade);
  document.fonts?.ready.then(updateFade);
  updateFade();

  // Компактное меню разделов: в партии на телефоне шапка прячется, лента открывается кнопкой ☰ в HUD.
  const header = $('.app-header');
  // Кнопка ☰ есть в шапке каждого раздела: на телефоне лента разделов прячется за ней
  const toggles = $$('.hud-menu');
  const toggleOf = (tab) => document.querySelector(`#${tab} .hud-menu`);
  const COMPACT_TABS = ['game', 'calc', 'train', 'drill', 'duel', 'stats', 'sim'];
  const scrim = $('#navScrim');
  const isOpen = () => !!header?.classList.contains('nav-open');
  const setMenu = (open, { focus = false } = {}) => {
    if (!header) return;
    header.classList.toggle('nav-open', open);
    toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (scrim) scrim.hidden = !open;
    if (open) (nav?.querySelector('.tab-btn.on') || nav?.querySelector('.tab-btn'))?.focus();
    else if (focus) toggleOf(document.body.dataset.tab)?.focus();
  };
  toggles.forEach((t) => t.addEventListener('click', () => setMenu(!isOpen())));
  scrim?.addEventListener('click', () => setMenu(false, { focus: true }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setMenu(false, { focus: true });
  });
  nav?.addEventListener('keydown', (e) => {
    if (!isOpen() || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = [...nav.querySelectorAll('.tab-btn')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  // Телефон повернули или окно растянули — меню в прежнем виде не нужно.
  window.matchMedia?.('(min-width: 1100px)').addEventListener?.('change', () => setMenu(false));
  const setTab = (tab) => {
    document.body.dataset.tab = tab;
    document.body.toggleAttribute('data-compact-nav', COMPACT_TABS.includes(tab));
  };
  setTab($('.tab-btn.on')?.dataset.t || 'calc');

  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => {
        b.classList.toggle('on', b === btn);
        if (b === btn) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      const target = btn.dataset.t;
      setTab(target);
      const wasOpen = isOpen();
      setMenu(false);
      // Лента могла быть скрыта (меню ☰): прокручиваем к вкладке и пересчитываем края, когда она уже на экране
      requestAnimationFrame(() => {
        btn.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        updateFade();
      });
      TABS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hide', id !== target);
      });
      // Фокус — после смены раздела, иначе кнопка ☰ нового раздела ещё скрыта
      if (wasOpen) (toggleOf(target) && COMPACT_TABS.includes(target) ? toggleOf(target) : btn)?.focus();
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

// ================= Тренажёр =================

function setupTrainer() {
  if (!P) return;

  // Статистику не держим в переменной: её пишут и другие разделы (см. updateStats).
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

  // Выбор цифры кнопками; источник правды остаётся в #tF (скрытый select)
  const facePick = $('#tPick');
  const syncPick = () => {
    const cur = +($('#tF')?.value) || 0;
    $$('#tPick .face-btn').forEach((b, i) => {
      b.classList.toggle('sel', i + 1 === cur);
      b.setAttribute('aria-checked', String(i + 1 === cur));
    });
  };
  if (facePick && faceSel) {
    facePick.innerHTML = '';
    for (let f = 1; f <= 6; f++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'face-btn';
      b.innerHTML = renderDie(f, 's');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Цифра ${f}`);
      b.onclick = () => { faceSel.value = f; syncPick(); };
      facePick.append(b);
    }
  }
  const stepQ = (d) => {
    const q = $('#tQ');
    if (q) q.value = Math.max(1, (+q.value || 1) + d);
  };
  if ($('#tMinus')) $('#tMinus').onclick = () => stepQ(-1);
  if ($('#tPlus')) $('#tPlus').onclick = () => stepQ(1);
  const setAnswered = (on) => $('#tLayout')?.classList.toggle('is-answered', on);

  function persist() { setTrainingQueue(queue); updateStat(); }

  function updateStat() {
    const el = $('#tStat');
    if (!el) return;
    const mk = $('#tMode').value;
    const S = getStats();
    const b = (S.byMode || {})[mk] || { n: 0, good: 0 };
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
    syncPick();
    setAnswered(false);
    if ($('#tFb')) $('#tFb').innerHTML = '';
    updateSettingsHint();
    updateStat();
  }
  function updateSettingsHint() {
    const el = $('#tSettingsHint');
    if (!el) return;
    const thr = (+$('#tT').value || 0.5).toFixed(2);
    el.textContent = `${modeLabel($('#tMode').value)} · порог ${thr}`;
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
      ? `<p class="muted">Самая сильная безопасная ставка: ${renderBid(b.q, b.f)} (${pct(b.p)}).</p>`
      : '<p class="muted">Безопасных повышений выше порога нет — «Не верю» часто лучший выбор.</p>';
  }

  function answer(good, html) {
    if (answered || !cur) return;
    answered = true;

    const mk = $('#tMode').value;
    updateStats((S) => {
      S.n++;
      S.byMode[mk] = S.byMode[mk] || { n: 0, good: 0 };
      S.byMode[mk].n++;
      if (good) { S.good++; S.byMode[mk].good++; }
    });

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
        `<div class="big ${good ? 'text-ok' : 'text-bad'}">${good ? '✓ Хорошее решение' : '✗ Сомнительное решение'}</div>${html}`;
    }
    setAnswered(true);
    $('#tNext')?.focus();
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
  if ($('#tNext')) $('#tNext').onclick = () => { newSituation(); $('#tDudo')?.focus(); };

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
    updateStats((S) => {
      S.n = 0; S.good = 0; S.byMode = {};
      S.drill = { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };
    });
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

  function saveDrill(k, good) {
    updateStats((S) => {
      S.drill[k].n++;
      if (good) S.drill[k].good++;
    });
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
        `<p class="${ok1 ? 'text-ok' : 'text-bad'}">Ожидание: ${isNaN(a1) ? '—' : a1} → точное ${exp.toFixed(1)} = ` +
        `${ownCnt} (ваши, с джокерами) + ${unk} × ${f === 1 ? '1/6' : '1/3'}.</p>` +
        `<p class="${ok2 ? 'text-ok' : 'text-bad'}">Безопасная ставка (шанс ≥ 50%): ваш ответ ${isNaN(a2) ? '—' : a2}, точно ${safe} ` +
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

        `<p class="muted">Замечание: E[X] и «безопасная ставка» — разные величины. ` +
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
      $$('[data-drill-for]').forEach((el) => el.classList.toggle('hide', el.dataset.drillFor !== activeDrill));
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
        `<p class="${ok ? 'text-ok' : 'text-bad'}">${ok ? 'Верно' : 'Неверно'}: ` +
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

// ================= Боковая панель партии =================
// Вкладки (Расчёт / Журнал / Разбор / Настройки). На ноутбуке — колонка справа,
// на телефоне и планшете — нижняя шторка, которую открывают кнопки в HUD.

function setupSidePanel() {
  const side = $('#gSide');
  if (!side) return;

  const backdrop = $('#gBackdrop');
  const body = side.querySelector('.side-body');
  const tabs = [...side.querySelectorAll('[role="tab"]')];
  const wide = window.matchMedia('(min-width: 1101px)');
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  let opener = null;

  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panelOf(t).hidden = !on;
    });
    if (tab.id === 'tabLog' || tab.id === 'tabReview') body.scrollTop = body.scrollHeight;
  }

  const selected = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true');

  function open(tabId, from) {
    if (tabId) select(document.getElementById(tabId));
    opener = from || null;
    side.classList.add('is-open');
    side.setAttribute('role', 'dialog');
    side.setAttribute('aria-modal', 'true');
    if (backdrop) backdrop.hidden = false;
    selected()?.focus();
  }

  function close() {
    if (!side.classList.contains('is-open')) return;
    side.classList.remove('is-open');
    side.removeAttribute('role');
    side.removeAttribute('aria-modal');
    if (backdrop) backdrop.hidden = true;
    opener?.focus?.();
    opener = null;
  }

  tabs.forEach((t) => t.addEventListener('click', () => select(t)));

  // Стрелки ←/→ между вкладками
  side.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    select(next);
  });

  // Пока шторка открыта, Tab ходит только внутри неё
  side.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !side.classList.contains('is-open')) return;
    const items = [...side.querySelectorAll('button, input, select, a[href]')]
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  $$('[data-open-tab]').forEach((b) => b.addEventListener('click', () => {
    const tab = document.getElementById(b.dataset.openTab);
    if (wide.matches) select(tab);        // панель уже на экране
    else open(b.dataset.openTab, b);
  }));

  backdrop?.addEventListener('click', close);
  side.querySelector('.sheet-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wide.addEventListener?.('change', (e) => { if (e.matches) close(); });

  sideApi.close = close;
  // Режим «Игра» — без подсказок, поэтому по умолчанию журнал; иначе расчёт.
  sideApi.pick = () => select(document.getElementById(
    assistConfig.showFutureBidOdds ? 'tabCalc' : 'tabLog'));
  sideApi.select = (tabId) => {
    const tab = document.getElementById(tabId);
    if (tab) select(tab);
  };
  sideApi.keepAtEnd = (panelId) => {
    const panel = document.getElementById(panelId);
    if (panel && !panel.hidden) body.scrollTop = body.scrollHeight;
  };
}

// ================= Партия (движок + стол) =================

let game = null;
let gameLogEntries = [];
let reviewEntries = [];
let selectedFace = 2;
let botTimer = null;
let lastBidKey = '';

// Заполняется в setupSidePanel(): закрыть шторку, выбрать вкладку по режиму помощи,
// удержать журнал внизу. До инициализации — безопасные заглушки.
const sideApi = { close() {}, pick() {}, select() {}, keepAtEnd() {} };
let lastLoggedRound = 0;

function setupGame() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="new-game"]')) startNewGame();
  });
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

  setupBotStyles();
  setupBotMind();
  setupResultDialog();
  setupReveal();
  startNewGame();
}

// ================= Стили ботов в настройках =================

function botCountSetting() {
  return Math.max(1, Math.min(5, +($('#gBots')?.value || 3)));
}

// По одному выпадающему списку на каждого бота; при смене числа ботов
// уже сделанный выбор сохраняется.
function setupBotStyles() {
  const box = $('#gBotStyles');
  if (!box) return;

  const help = $('#gStyleHelp');
  if (help) {
    help.textContent = BOT_STYLE_IDS
      .map((id) => `${BOT_STYLES[id].icon} ${BOT_STYLES[id].name} — ${BOT_STYLES[id].desc}`)
      .join('. ') + '.';
  }

  const options = [
    `<option value="${STYLE_AUTO}">По умолчанию</option>`,
    `<option value="${STYLE_RANDOM}">🎲 Случайный</option>`,
    ...BOT_STYLE_IDS.map((id) => `<option value="${id}">${BOT_STYLES[id].icon} ${BOT_STYLES[id].name}</option>`),
  ].join('');

  const render = () => {
    const prev = [...box.querySelectorAll('select')].map((sel) => sel.value);
    const n = botCountSetting();
    let html = '';
    for (let i = 0; i < n; i += 2) {
      html += '<div class="field-row">';
      for (let j = i; j < Math.min(i + 2, n); j++) {
        html += `<label class="field">Бот ${j + 1}<select id="gBotStyle${j}" data-bot-style>${options}</select></label>`;
      }
      html += '</div>';
    }
    box.innerHTML = html;
    box.querySelectorAll('select').forEach((sel, i) => { if (prev[i]) sel.value = prev[i]; });
  };

  $('#gBots')?.addEventListener('input', render);
  $('#gBots')?.addEventListener('change', render);
  render();
}

function chosenBotStyles(count) {
  const choices = [...document.querySelectorAll('#gBotStyles select')].map((sel) => sel.value);
  return pickBotStyles(count, choices);
}

// ================= Шум и память ботов =================

// Что боты помнят об игроке (между партиями, в localStorage).
let botMemory = normalizeMemory(getBotMemory());
// Настройки применяются к новой партии, как и остальные.
let gameBotLevel = DEFAULT_BOT_LEVEL;
let gameMemoryOn = true;

function renderMemoryInfo() {
  const info = $('#gMemoryInfo');
  if (info) info.textContent = describeMemory(botMemory);
}

function setupBotMind() {
  $('#gMemoryReset')?.addEventListener('click', () => {
    botMemory = createMemory();
    setBotMemory(botMemory);
    renderMemoryInfo();
  });
  renderMemoryInfo();
}

// Боты замечают, когда проверили ставку человека и она оказалась (не)ложной.
function observeReveal(events) {
  if (!gameMemoryOn || !game) return;
  const humanId = game.players[0].id;
  let next = botMemory;
  for (const e of events || []) next = observeEvent(next, e, humanId);
  if (next !== botMemory) {
    botMemory = next;
    setBotMemory(botMemory);
    renderMemoryInfo();
  }
}

function totalDice() {
  if (!game) return 0;
  return game.players.reduce((s, p) => s + Math.max(0, p.dice || 0), 0);
}

function startNewGame() {
  clearTimeout(botTimer);
  if (!P) return;

  const botCount = botCountSetting();
  const startDice = Math.max(1, Math.min(10, +($('#gDice')?.value || 5)));
  const calzaEnabled = !!$('#gCalzaOpt')?.checked;
  const palificoEnabled = !!$('#gPalificoOpt')?.checked;
  const assistMode = $('#gAssist')?.value || 'training';
  const botSpeed = $('#gSpeed')?.value || 'normal';
  gameBotLevel = $('#gBotLevel')?.value || DEFAULT_BOT_LEVEL;
  gameMemoryOn = $('#gMemoryOpt') ? $('#gMemoryOpt').checked : true;

  assistConfig = createAssistConfig(assistMode);
  sideApi.close();
  sideApi.pick();

  const characters = chosenBotStyles(botCount).map((style) => generateCharacter(style));

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
  hideRevealUi();
  hideResultUi();
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
        const cls = e.type === 'dudo' ? 'dudo' : e.type === 'round' ? 'round-head' : '';
        return `<div class="log-row ${cls}">${e.html}</div>`;
      })
      .join('');
    sideApi.keepAtEnd('panLog');
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
    el.innerHTML = '<span class="muted">Здесь появится оценка ваших ходов.</span>';
    return;
  }
  el.innerHTML = reviewEntries.map((e) => `
    <div class="review-row ${e.v.code}">
      <span class="review-badge">${e.v.code === 'good' ? '✓' : e.v.code === 'meh' ? '~' : '✗'}</span>
      <div>
        <b>Раунд ${e.round}.</b> ${e.text}
        ${e.outcome ? `<div class="muted">${e.outcome}</div>` : ''}
      </div>
    </div>
  `).join('');
  sideApi.keepAtEnd('panReview');
}

// ----- Рендер -----

function gameViewForRender() {
  return {
    state: game.state,
    winner: game.winner,
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
      addGameLog('round',
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
      const h = resultHeadline(buildGameResult(game));
      txt = `${h.icon} ${escapeHtml(h.title)}`;
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
    const calzaAvailable = engineCanCalza(game) && game.bid && game.bid.playerId !== game.players[0].id;
    $('#gCalza').disabled = dis || !calzaAvailable;
    $('#gCalza').classList.toggle('hide', !game.calzaEnabled);
  }

  ['#gRaise', '#gQ', '#gMinus', '#gPlus'].forEach((s) => {
    const el = $(s);
    if (el) el.disabled = dis;
  });
  $('#gDock')?.classList.toggle('is-waiting', dis);
  $('.game-main')?.classList.toggle('is-finished', game.state === 'finished');

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
      b.className = 'face-btn' + (f === selectedFace ? ' sel' : '');
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

  addGameLog('', `<span class="player-name c0">Вы</span> ${renderBid(q, f)}`);
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

  observeReveal(res.events);
  const revealed = res.events.find((e) => e.type === 'DICE_REVEALED');
  if (revealed) {
    entry.outcome = `На столе было ${revealed.actualCount} при ставке ${q} — ` +
      (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.';
  }

  addGameLog('dudo', `<b class="text-bad">НЕ ВЕРЮ</b> (${renderBid(q, f)})`);
  if (revealed) {
    addGameLog('round',
      `Проверка: на столе ${revealed.actualCount} из ${q} — ` +
      (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.');
  }

  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  presentReveal(res.events);
  continueFlow();
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
  presentReveal(res.events);
  continueFlow();
}

// ----- Вскрытие кубиков после «Не верю» / Calza -----

let revealTimer = null;
const REVEAL_MS = { slow: 9000, normal: 6000, fast: 3500 };   // «Пошагово» — только по кнопке

const revealIsOpen = () => !!$('#gReveal')?.open;

function revealTone(m) {
  const me = m.rows.find((r) => r.isHuman);
  if (!me) return '';
  if (m.kind === 'dudo') {
    if (me.isLoser) return 'is-bad';
    return me.isBidder || me.isChallenger ? 'is-good' : '';
  }
  if (!me.isChallenger) return '';
  return m.verdict === 'calza_exact' ? 'is-good' : 'is-bad';
}

function presentReveal(events) {
  const dlg = $('#gReveal');
  if (!game || !dlg || dlg.open || typeof dlg.showModal !== 'function') return false;
  if ($('#gRevealOpt')?.checked === false) return false;
  if ($('#game')?.classList.contains('hide')) return false;
  const m = buildReveal(events, game.players);
  if (!m) return false;

  $('#gRevealTitle').textContent = m.headline;
  $('#gRevealBid').innerHTML =
    `Ставка · ${escapeHtml(m.bid.playerName)}: ${renderBid(m.bid.q, m.bid.f)}` +
    (m.wild ? '' : ' · палифико, единицы не джокеры');
  $('#gRevealRows').innerHTML = m.rows.map((r) => {
    const role = [r.isBidder ? 'ставил' : '', r.isChallenger ? 'проверял' : ''].filter(Boolean).join(', ');
    const dice = r.hand.map((d) => {
      const html = renderDie(d, 'xs', m.wild && d === 1);
      return dieMatches(d, m.bid.f, m.wild) ? html.replace('class="die', 'class="die hit') : html;
    }).join('');
    return `<li class="reveal-row ${r.isLoser ? 'is-loser' : ''}">` +
      `<span class="reveal-name">${escapeHtml(r.name)}${role ? `<small>${role}</small>` : ''}</span>` +
      `<span class="reveal-hand" aria-label="Кубики: ${r.hand.join(', ')}">${dice}</span>` +
      `<span class="reveal-hit ${r.matches ? '' : 'zero'}" aria-label="Совпало: ${r.matches}">${r.matches ? '+' + r.matches : '0'}</span></li>`;
  }).join('');
  const verdict = $('#gRevealVerdict');
  verdict.textContent = m.verdictText;
  verdict.className = `reveal-verdict ${revealTone(m)}`;
  $('#gRevealOutcome').textContent = m.outcomeText;

  const speed = $('#gSpeed')?.value || 'normal';
  const ms = REVEAL_MS[speed];
  const bar = $('#gRevealBar');
  const timerBox = bar?.parentElement;
  if (bar) {
    bar.classList.remove('run');
    void bar.offsetWidth;                         // перезапуск анимации
    if (ms) { bar.style.setProperty('--reveal-ms', `${ms}ms`); bar.classList.add('run'); }
    if (timerBox) timerBox.style.visibility = ms ? 'visible' : 'hidden';
  }

  clearTimeout(revealTimer);
  revealTimer = ms ? setTimeout(() => { if (dlg.open) dlg.close(); }, ms) : null;
  dlg.showModal();
  dlg.scrollTop = 0;                    // автофокус на кнопке не должен прятать заголовок
  return true;
}

function setupReveal() {
  const dlg = $('#gReveal');
  if (!dlg) return;
  $('#gRevealNext')?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // В окне одна кнопка: Tab не должен выпускать фокус в интерфейс браузера.
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('#gRevealNext')?.focus(); } });
  dlg.addEventListener('close', () => {
    clearTimeout(revealTimer);
    revealTimer = null;
    continueFlow();
    // Партия закончилась этим вскрытием: окно итога — после него, а не поверх.
    if (game && game.state === 'finished') scheduleResultDialog(300);
  });
}

// Дальше ходят боты — но не пока на экране вскрытие.
function continueFlow() {
  if (!game || revealIsOpen()) return;
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
      noise: noiseForLevel(gameBotLevel),
      opponent: gameMemoryOn && game.bid && game.bid.playerId === game.players[0].id
        ? opponentModel(botMemory) : null,
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
  else if (action.type === 'dudo') desc = '<b class="text-bad">НЕ ВЕРЮ</b>';
  else desc = '<b class="warn">CALZA</b>';
  addGameLog('', `<span class="player-name c${idx}">${bot.name}</span> ${desc}`);

  if (action.type === 'dudo') {
    observeReveal(res.events);
    const revealed = res.events.find((e) => e.type === 'DICE_REVEALED');
    if (revealed) {
      const bidQ = revealed.bid?.q ?? revealed.bid?.quantity;
      addGameLog('round',
        `Проверка: на столе ${revealed.actualCount} из ${bidQ} — ` +
        (revealed.bidSuccessful ? 'ставка верна' : 'ставка ложна') + '.');
    }
  }

  if (game.state === 'round_resolving') game.state = 'active';
  renderGame();
  if (action.type !== 'raise') presentReveal(res.events);
  continueFlow();
}

// ----- Финализация -----

// Итог партии подводится один раз: renderGame() вызывается много раз, в том числе
// уже после финала, и без этой защиты история и статистика дублировались бы.
let finalizedGameId = null;
let resultTimer = null;
let resultOpener = null;
const RESULT_DIALOG_DELAY_MS = 700;

function hideRevealUi() {
  clearTimeout(revealTimer);
  revealTimer = null;
  const dlg = $('#gReveal');
  if (dlg?.open) dlg.close();
}

function hideResultUi() {
  clearTimeout(resultTimer);
  resultTimer = null;
  const dlg = $('#gResultDialog');
  if (dlg?.open) dlg.close();
  const banner = $('#gSummary');
  if (banner) banner.innerHTML = '';
  const card = $('#gResultCard');
  if (card) { card.innerHTML = ''; card.hidden = true; }
}

function fillResultDialog(result) {
  const h = resultHeadline(result);
  $('#gResultIcon').textContent = h.icon;
  $('#gResultTitle').textContent = h.title;
  $('#gResultLead').textContent = h.lead;
  $('#gResultStand').innerHTML = result.standings.map((r) =>
    `<li class="${r.id === result.winnerId ? 'is-winner' : ''}">` +
    `<span>${r.id === result.winnerId ? '👑 ' : ''}${escapeHtml(r.name)}</span>` +
    `<span>${r.alive ? pluralDice(r.dice) : 'выбыл'}</span></li>`).join('');
}

function showResultDialog() {
  const dlg = $('#gResultDialog');
  const result = buildGameResult(game);
  if (!dlg || !result || dlg.open || typeof dlg.showModal !== 'function') return false;
  if ($('#game')?.classList.contains('hide')) return false;   // вкладка «Партия» не на экране
  fillResultDialog(result);
  resultOpener = document.activeElement;
  dlg.showModal();
  return true;
}

function setupResultDialog() {
  const dlg = $('#gResultDialog');
  if (!dlg) return;
  $('#gResultView')?.addEventListener('click', () => dlg.close());
  // После закрытия фокус возвращается туда, откуда окно открыли; если там уже ничего нет —
  // на «Сыграть ещё» в баннере (нативный диалог в Chromium оставляет фокус на скрытой кнопке).
  dlg.addEventListener('close', () => {
    const usable = (el) => el && el.isConnected && !el.disabled && !el.closest('dialog') && el.offsetParent !== null;
    const target = usable(resultOpener) ? resultOpener : $('#gSummary [data-action="new-game"]');
    resultOpener = null;
    target?.focus?.();
  });
  // Клик по подложке: у диалога нет собственных отступов, поэтому target === dialog — это именно подложка.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // Tab ходит по кругу внутри окна (нативный диалог иначе выпускает фокус в интерфейс браузера).
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dlg.querySelectorAll('button:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Баннер: «Итоги» заново открывает окно.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-result-details]')) showResultDialog();
  });
}

function finalizeGame() {
  if (!game || finalizedGameId === game.id) return;
  finalizedGameId = game.id;

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

  updateStats((stats) => {
    stats.totalGames = (stats.totalGames || 0) + 1;
    if (won) stats.totalWins = (stats.totalWins || 0) + 1;
  });

  const result = buildGameResult(game);
  const h = resultHeadline(result);

  // 1) Баннер над столом (на телефоне — закреплён внизу вместо панели действий)
  const banner = $('#gSummary');
  if (banner && result) {
    banner.innerHTML = `
      <div class="card result-banner ${result.isHumanWinner ? 'is-win' : 'is-lose'}" role="group" aria-label="Итог партии">
        <div class="result-banner-text">
          <b>${h.icon} ${escapeHtml(h.title)}</b>
          <span class="muted">${escapeHtml(h.lead)}</span>
        </div>
        <div class="result-banner-actions">
          <button type="button" class="btn-primary" data-action="new-game">Сыграть ещё</button>
          <button type="button" data-result-details>Итоги</button>
        </div>
      </div>`;
  }

  // 2) Подробности — в начале боковой панели
  const card = $('#gResultCard');
  if (card) {
    const good = reviewEntries.filter((e) => e.v.code === 'good').length;
    const meh = reviewEntries.filter((e) => e.v.code === 'meh').length;
    const bad = reviewEntries.filter((e) => e.v.code === 'bad').length;
    const acc = reviewEntries.length ? (good + 0.5 * meh) / reviewEntries.length : null;
    card.innerHTML = `
      <b>Итог партии: ${won ? 'победа 🏆' : 'поражение'}</b>
      <p>Решений: ${reviewEntries.length}. Точность по модели: <b>${acc == null ? '—' : pct(acc)}</b>.</p>
      <table>
        <tr><th></th><th>✓ верно</th><th>~ спорно</th><th>✗ ошибка</th></tr>
        <tr><td>Решения</td><td>${good}</td><td>${meh}</td><td>${bad}</td></tr>
      </table>`;
    card.hidden = false;
    sideApi.select('tabReview');
  }

  // 3) Окно — чуть позже, чтобы успеть увидеть итог последней проверки
  scheduleResultDialog(RESULT_DIALOG_DELAY_MS);
}

function scheduleResultDialog(delay) {
  if (!game) return;
  const gameId = game.id;
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => {
    if (!game || game.id !== gameId || game.state !== 'finished') return;
    if (revealIsOpen()) return;          // его закрытие само вызовет scheduleResultDialog
    showResultDialog();
  }, delay);
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
  el.innerHTML = '<p class="muted">Оптимальные частоты первой ставки в зависимости от вашего кубика:</p>' + t + '</table>';
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
  set('perudo.duelStats', duelStats);

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
      byModeEl.innerHTML = '<p class="muted">Тренажёр ещё не использовался.</p>';
    } else {
      let h = '<table><tr><th>Режим</th><th>Всего</th><th>Верно</th><th>Процент</th></tr>';
      for (const k of keys) {
        const d = byMode[k];
        h += `<tr><td>${escapeHtml(modeLabel(k))}</td><td>${d.n}</td><td>${d.good}</td><td>${d.n ? pct(d.good / d.n) : '—'}</td></tr>`;
      }
      byModeEl.innerHTML = h + '</table>';
    }
  }

  const gamesEl = $('#stGames');
  if (gamesEl) {
    if (!history.length) {
      gamesEl.innerHTML = '<p class="muted">Сыгранных партий пока нет.</p>';
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
        'perudo.trainingQueue', 'perudo.duelStats', 'perudo.botMemory'].forEach((k) => localStorage.removeItem(k));
    } catch (e) { }
    botMemory = createMemory();
    renderMemoryInfo();
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
  setupSidePanel();
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
  renderGame,
  solveNow,
  startDuel,
  moveDuel,
};