// app_v2.js — UI приложения Perudo Trainer v2
// Интегрирует engine.js, rules.js, assist.js, storage.js

import { createGame, startGame, applyAction, getLegalActions, getPublicState, getPrivateState } from './engine.js';
import { legal, minLegal, onesDown, onesUp } from './rules.js';
import { createAssistConfig, AssistMode, getAdviceText, getClassification } from './assist.js';
import { getSettings, setSettings, getStats, setStats, getTrainingQueue, setTrainingQueue, addGame, migrateIfNeeded } from './storage.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ================= Инициализация =================

migrateIfNeeded();

let game = null;
let assistConfig = createAssistConfig('training');
let currentSettings = getSettings();

// ================= Вкладки =================

const TABS = ['calc', 'train', 'drill', 'game', 'duel', 'stats', 'sim'];

function setupTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.tab-btn').forEach(b => b.classList.toggle('on', b === btn));
      TABS.forEach(id => $(`#${id}`).classList.toggle('hide', id !== btn.dataset.t));
      if (btn.dataset.t === 'stats') renderStats();
    };
  });
}

// ================= Калькулятор =================

function setupCalculator() {
  let hand = [1, 3, 5, 5, 6];

  // Импортируем Perudo из core.js (вероятности)
  const P = window.Perudo;
  const { probBid, probBidRead, own, pFace, atLeast, bestBid, roll } = P;

  const pct = x => (x * 100).toFixed(1) + '%';
  const die = (v, size = '', wild = false) => {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    let c = '';
    for (let i = 0; i < 9; i++) c += `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`;
    return `<span class="pd ${size} ${wild && v === 1 ? 'wild' : ''}" title="${v}">${c}</span>`;
  };
  const diceHTML = (h, w, size) => h.slice().sort().map(d => die(d, size || '', w && d === 1)).join('') || '<span class="m">—</span>';
  const chip = (q, f, cls = '') => `<span class="chip ${cls}">${q}<em>×</em>${die(f, cls ? '' : 's')}</span>`;

  // Кнопки добавления костей
  const cPad = $('#cPad');
  for (let d = 1; d <= 6; d++) {
    const b = document.createElement('button');
    b.textContent = `+${d}`;
    b.onclick = () => { if (hand.length < +$('#cN').value || +$('#cN').value === 0) { hand.push(d); calc(); } };
    cPad.append(b);
  }

  $('#cClr').onclick = () => { hand = []; calc(); };
  $('#cRnd').onclick = () => { hand = roll(Math.min(5, +$('#cN').value || 5)); calc(); };
  $('#cUndo').onclick = () => { hand.pop(); calc(); };

  function calc() {
    const n = +$('#cN').value || 1;
    const t = +$('#cT').value;
    const w = $('#cW').checked;
    const tr = +$('#cTr').value;

    if (hand.length > n) hand = hand.slice(0, n);

    $('#cHand').innerHTML = diceHTML(hand, w);

    const q = +$('#cQ').value;
    const f = +$('#cF').value;
    const p = probBid(q, f, n, hand, w);

    const unk = n - hand.length;
    const kF = Math.max(0, Math.min(+$('#cK').value || 0, unk));
    const pr = probBidRead(q, f, hand, [{ k: kF, faces: [f] }, { k: unk - kF, faces: [] }], w, tr);

    $('#cTrV').textContent = tr.toFixed(2);
    $('#cRes').innerHTML = `${chip(q, f)} <b>${pct(p)}</b> → <span class="${p >= t ? 'g' : 'r'}">${p >= t ? 'ВЕРЮ / можно повышать осторожно' : 'НЕ ВЕРЮ'}</span>`;
    $('#cRead').innerHTML = kF > 0 ? `С учётом чтения ставок (${kF} куб. у ставивших на эту цифру, доверие ${tr.toFixed(2)}): <b class="${pr >= t ? 'g' : 'r'}">${pct(pr)}</b>` : '<span class="m">Чтобы учесть чужие ставки, укажите, сколько кубиков у игроков, поставивших на эту цифру.</span>';

    let h = '<table><tr><th>Цифра</th><th>У вас</th><th>Макс. кол-во</th><th>Шанс</th><th>На 1 больше</th><th></th></tr>';
    for (let ff = 1; ff <= 6; ff++) {
      const m = bestBid(ff, n, hand, w, t);
      const pq = m ? probBid(m, ff, n, hand, w) : 0;
      const pn = probBid(m + 1, ff, n, hand, w);
      h += `<tr><td>${die(ff, 'xs')}</td><td>${own(hand, ff, w)}</td><td>${m}</td><td>${pct(pq)}</td><td>${pct(pn)}</td><td><div class="bar"><i style="width:${pq * 100}%"></i></div></td></tr>`;
    }
    $('#cTbl').innerHTML = h + '</table>';
  }

  ['#cN', '#cT', '#cW', '#cQ', '#cF', '#cK', '#cTr'].forEach(s => $(s).oninput = calc);
  calc();
}

// ================= Тренажёр =================

function setupTrainer() {
  const P = window.Perudo;
  const { probBid, bestSafeRaise, roll, ri, pct } = P;

  const MODES = {
    classic: { name: 'Классика (5 кубиков у вас)', wild: true, n: [10, 20], k: () => 5, bluff: 0.25, d: 'Единицы — джокеры. Среднее количество кубиков.' },
    nowild: { name: 'Без джокеров / Палифико', wild: false, n: [10, 20], k: () => 5, bluff: 0.25, d: 'Все цифры имеют шанс 1/6. Ставки заметно меньше.' },
    endgame: { name: 'Эндшпиль (3–6 кубиков всего)', wild: true, n: [3, 6], k: n => ri(1, Math.ceil(n / 2)), bluff: 0.3, d: 'Почти дуэль: ваши кубики решают многое.' },
    big: { name: 'Большой стол (25–40 кубиков)', wild: true, n: [25, 40], k: () => 5, bluff: 0.2, d: 'Много неизвестных: работает «среднее ожидание».' },
    bluffer: { name: 'Блефующий соперник', wild: true, n: [10, 20], k: () => 5, bluff: 0.7, d: 'Соперник часто завышает ставку — проверяйте на «Не верю».' },
    solo: { name: 'Мало кубиков у вас (1–2)', wild: true, n: [8, 16], k: () => ri(1, 2), bluff: 0.3, d: 'Вы почти не знаете свою руку — полагайтесь на вероятность.' },
  };

  for (const k in MODES) $('#tMode').add(new Option(MODES[k].name, k));

  let S = getStats();
  S.drill = S.drill || { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };
  S.byMode = S.byMode || {};

  let QUEUE = getTrainingQueue();
  let cur = null;
  let answered = false;

  const die = (v, size = '', wild = false) => {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    let c = '';
    for (let i = 0; i < 9; i++) c += `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`;
    return `<span class="pd ${size} ${wild && v === 1 ? 'wild' : ''}" title="${v}">${c}</span>`;
  };
  const diceHTML = (h, w, size) => h.slice().sort().map(d => die(d, size || '', w && d === 1)).join('') || '<span class="m">—</span>';
  const chip = (q, f, cls = '') => `<span class="chip ${cls}">${q}<em>×</em>${die(f, cls ? '' : 's')}</span>`;

  function newSit() {
    const mk = $('#tMode').value;
    const m = MODES[mk];
    const pool = QUEUE.filter(x => x.mode === mk);

    if (pool.length && Math.random() < 0.4) {
      const it = pool[Math.floor(Math.random() * pool.length)];
      cur = { m, n: it.n, h: it.h.slice(), f: it.f, q: it.q, item: it };
    } else {
      const n = ri(...m.n);
      const k = Math.min(m.k(n), n - 1) || 1;
      const h = roll(k);
      const f = ri(1, 6);
      let q = Math.round(n * P.pFace(f, m.wild) + (Math.random() < m.bluff ? ri(1, 3) : ri(-2, 1)));
      q = Math.max(1, Math.min(n, q));
      cur = { m, n, h, f, q, item: null };
    }

    answered = false;
    $('#tDesc').textContent = m.d;
    $('#tInfo').innerHTML = `${cur.item ? '🔁 <b>Повтор вашей прошлой ошибки.</b> ' : ''}Всего кубиков: ${cur.n}, у вас ${cur.h.length}, неизвестных: ${cur.n - cur.h.length}. Единицы ${m.wild ? '— джокеры' : 'не джокеры'}.`;
    $('#tHand').innerHTML = diceHTML(cur.h, m.wild);
    $('#tBid').innerHTML = chip(cur.q, cur.f, 'xl');
    $('#tQ').value = cur.q;
    $('#tF').value = Math.min(6, cur.f + 1);
    $('#tFb').innerHTML = '';
    stat();
  }

  function stat() {
    const mk = $('#tMode').value;
    const b = S.byMode[mk] || { n: 0, good: 0 };
    $('#tStat').innerHTML = `Всего: ${S.n}, верных решений: ${S.good} (${S.n ? pct(S.good / S.n) : '—'}). В выбранном режиме: ${b.n ? `${b.good}/${b.n} (${pct(b.good / b.n)})` : '—'}. В очереди повторов: ${QUEUE.length}.`;
  }

  function save() {
    setStats(S);
    setTrainingQueue(QUEUE);
    stat();
  }

  function hint() {
    const b = P.bestSafeRaise({ q: cur.q, f: cur.f }, cur.n, cur.h, { wild: cur.m.wild }, null, 0, +$('#tT').value);
    return b ? `<p class="m">Самая сильная безопасная ставка: ${chip(b.q, b.f)} (${pct(b.p)}).</p>` : '<p class="m">Безопасных повышений выше порога нет — «Не верю» часто лучший выбор.</p>';
  }

  $('#tDudo').onclick = () => {
    if (answered) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const p = probBid(q, f, n, h, m.wild);
    answer(p < t, `<p>Шанс, что ставка ${chip(q, f)} верна: <b>${pct(p)}</b> (порог ${pct(t)}). ${p < t ? 'Ставка слишком смелая — «Не верю» оправдано.' : 'Ставка вероятна — лучше было верить и повышать.'}</p>` + hint());
  };

  $('#tRaise').onclick = () => {
    if (answered) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const Q = +$('#tQ').value;
    const F = +$('#tF').value;

    if (!(Q > q || (Q === q && F > f))) {
      $('#tFb').innerHTML = '<span class="r">Ставка должна быть выше: больше количество или та же цифра и больше значение.</span>';
      return;
    }
    if (Q > n) {
      $('#tFb').innerHTML = '<span class="r">Ставка больше общего числа кубиков.</span>';
      return;
    }

    const p = probBid(Q, F, n, h, m.wild);
    const po = probBid(q, f, n, h, m.wild);
    answer(p >= t, `<p>Ваша ставка ${chip(Q, F)} верна с шансом <b>${pct(p)}</b> (порог ${pct(t)}). Ставка соперника была верна с шансом ${pct(po)}.</p>` + hint());
  };

  function answer(good, html) {
    if (answered) return;
    answered = true;
    const mk = $('#tMode').value;

    S.n++;
    S.byMode[mk] = S.byMode[mk] || { n: 0, good: 0 };
    S.byMode[mk].n++;

    if (good) {
      S.good++;
      S.byMode[mk].good++;
    }

    if (cur.item) {
      if (good) {
        cur.item.streak = (cur.item.streak || 0) + 1;
        if (cur.item.streak >= 2) QUEUE = QUEUE.filter(x => x !== cur.item);
      } else {
        cur.item.streak = 0;
      }
    } else if (!good) {
      QUEUE.push({ mode: mk, n: cur.n, h: cur.h.slice(), f: cur.f, q: cur.q, streak: 0 });
    }

    save();
    $('#tFb').innerHTML = `<div class="big ${good ? 'g' : 'r'}">${good ? '✓ Хорошее решение' : '✗ Сомнительное решение'}</div>${html}`;
  }

  $('#tNew').onclick = newSit;
  $('#tMode').onchange = newSit;
  $('#tReset').onclick = () => {
    S = { n: 0, good: 0, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } };
    QUEUE = [];
    save();
    newSit();
  };

  newSit();
}


// ================= Упражнения =================

function setupDrill() {
  const P = window.Perudo;
  const { roll, ri, bestBid, probBid, own, pFace, onesDown, onesUp } = P;

  const die = (v, size = '', wild = false) => {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    let c = '';
    for (let i = 0; i < 9; i++) c += `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`;
    return `<span class="pd ${size} ${wild && v === 1 ? 'wild' : ''}" title="${v}">${c}</span>`;
  };
  const diceHTML = (h, w, size) => h.slice().sort().map(d => die(d, size || '', w && d === 1)).join('') || '<span class="m">—</span>';

  let S = getStats();
  S.drill = S.drill || { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };

  let dA = null;
  let dB = null;

  function newA() {
    const n = ri(8, 30);
    const k = ri(1, 5);
    const h = roll(k);
    const f = ri(1, 6);
    dA = { n, h, f };

    $('#dAq').innerHTML = `Всего кубиков: <b>${n}</b>, единицы — джокеры. Ваши: ${diceHTML(h, true)} Цифра: ${die(f, 's')}`;
    $('#dA1').value = '';
    $('#dA2').value = '';
    $('#dAfb').innerHTML = '';
  }

  function newB() {
    const down = Math.random() < 0.5;
    const q = ri(3, 16);
    dB = { down, q, f: ri(2, 6) };

    $('#dBq').innerHTML = down ? `Текущая ставка ${q}×${dB.f}. Какое <b>минимальное</b> количество единиц можно назвать?` : `Текущая ставка ${q}×1 (единицы). Какое <b>минимальное</b> количество обычной цифры можно назвать?`;
    $('#dB1').value = '';
    $('#dBfb').innerHTML = '';
  }

  function drillSave(k, good) {
    S.drill[k].n++;
    if (good) S.drill[k].good++;
    setStats(S);
  }

  $('#dACheck').onclick = () => {
    if (!dA) return;
    const { n, h, f } = dA;
    const unk = n - h.length;
    const exp = own(h, f, true) + unk * pFace(f, true);
    const safe = bestBid(f, n, h, true, 0.5);

    const a1 = parseFloat(String($('#dA1').value).replace(',', '.'));
    const a2 = parseInt($('#dA2').value, 10);

    const ok1 = !isNaN(a1) && Math.abs(a1 - exp) <= 0.75;
    const ok2 = !isNaN(a2) && Math.abs(a2 - safe) <= 1;

    drillSave('A', ok1 && ok2);

    $('#dAfb').innerHTML = `<p class="${ok1 ? 'g' : 'r'}">Ожидание: ${isNaN(a1) ? '—' : a1} → точное ${exp.toFixed(1)} = ${own(h, f, true)} (ваши, с джокерами) + ${unk} × ${f === 1 ? '1/6' : '1/3'}.</p><p class="${ok2 ? 'g' : 'r'}">Безопасная ставка (шанс ≥ 50%): ваш ответ ${isNaN(a2) ? '—' : a2}, точно ${safe} (${pct(probBid(safe, f, n, h, true))}). Допуск ±1 — это тренировка прикидки в уме.</p>`;
  };

  $('#dANew').onclick = newA;

  $('#dBCheck').onclick = () => {
    if (!dB) return;
    const exp = dB.down ? onesDown(dB.q) : onesUp(dB.q);
    const a = parseInt($('#dB1').value, 10);
    const ok = a === exp;

    drillSave('B', ok);

    $('#dBfb').innerHTML = `<p class="${ok ? 'g' : 'r'}">${ok ? 'Верно' : 'Неверно'}: ${dB.down ? `с обычной цифры на единицы — половина ставки с округлением вверх: ⌈${dB.q}/2⌉ = ${exp}` : `с единиц на обычную цифру — больше удвоенного: ${dB.q}×2+1 = ${exp}`}.</p>`;
  };

  $('#dBNew').onclick = newB;

  newA();
  newB();
}

// ================= Партия с engine.js =================

function setupGame() {
  const P = window.Perudo;
  const { roll, ri, pct } = P;

  const die = (v, size = '', wild = false) => {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    let c = '';
    for (let i = 0; i < 9; i++) c += `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`;
    return `<span class="pd ${size} ${wild && v === 1 ? 'wild' : ''}" title="${v}">${c}</span>`;
  };
  const diceHTML = (h, w, size) => h.slice().sort().map(d => die(d, size || '', w && d === 1)).join('') || '<span class="m">—</span>';
  const chip = (q, f, cls = '') => `<span class="chip ${cls}">${q}<em>×</em>${die(f, cls ? '' : 's')}</span>`;
  const hidden = k => Array.from({ length: k }, () => '<span class="pd xs" style="background:#3a4152"></span>').join('');

  const NAMES = ['Алексей', 'Мария', 'Дмитрий', 'Ольга', 'Иван', 'Анна', 'Сергей', 'Елена', 'Николай', 'Татьяна', 'Андрей', 'Наталья'];

  let game = null;
  let timer = null;
  let gFace = 2;
  let gameLog = [];

  function addLog(html, cls = '') {
    gameLog.push(`<div class="lg ${cls}">${html}</div>`);
    const el = $('#gHistory');
    if (el) {
      el.innerHTML = gameLog.join('');
      el.scrollTop = el.scrollHeight;
    }
  }

  function later(fn, ms) {
    clearTimeout(timer);
    const g = game;
    timer = setTimeout(() => { if (game === g) fn(); }, ms);
  }

  function renderPick() {
    const el = $('#gPick');
    if (!el) return;
    el.innerHTML = '';
    for (let f = 1; f <= 6; f++) {
      const b = document.createElement('button');
      b.className = 'pf' + (f === gFace ? ' sel' : '');
      b.innerHTML = die(f, 's');
      b.onclick = () => { gFace = f; renderPick(); prevG(); };
      el.append(b);
    }
  }

  function prevG() {
    const el = $('#gPrev');
    if (!el || !game || game.over || game.currentPlayer !== 0 || game.players[0].dice <= 0) {
      if (el) el.innerHTML = '';
      return;
    }

    const totalDice = game.players.reduce((s, p) => s + p.dice, 0);
    const Q = +$('#gQ').value;
    const F = gFace;
    const me = game.players[0];
    const rules = { wild: !game.palifico };

    if (!legal(Q, F, game.bid, rules)) {
      el.innerHTML = `<span class="r">Ставка ${chip(Q, F)} недопустима: она должна быть выше текущей${game.palifico ? ' (Палифико: та же цифра, больше количество)' : ''}.</span>`;
      return;
    }

    const p = P.probBidRead(Q, F, me.hand, game.players.filter((p, i) => i !== 0 && p.dice > 0).map((p, i) => ({ k: p.dice, faces: game.faces ? game.faces[i + 1] || [] : [] })), !game.palifico, 0.2);
    el.innerHTML = `<span class="m">Ваша ставка</span> ${chip(Q, F)} <span class="m">— шанс по вашим кубикам и чтению ставок:</span> <b class="${p >= .5 ? 'g' : 'r'}">${pct(p)}</b>`;
  }

  function renderGame(msg = '') {
    if (!game) return;

    const totalDice = game.players.reduce((s, p) => s + p.dice, 0);
    const b = game.bid;
    const me = game.players[0];

    $('#gStatus').innerHTML = game.over ? (me.dice > 0 ? '🏆 Вы выиграли партию!' : `🏁 Партию выиграл ${game.players.find(p => p.dice > 0).name}.`) : (me.dice <= 0 ? 'Вы выбыли, партия идёт без вас…' : (game.currentPlayer === 0 ? 'Ваш ход' : `Ходит: <span class="c${game.currentPlayer}">${game.players[game.currentPlayer].name}</span>`));

    $('#gMeta').innerHTML = `Раунд ${game.round}. Всего кубиков на столе: ${totalDice}.${game.palifico ? ' <b class="warn">ПАЛИФИКО: единицы не джокеры, цифра фиксируется.</b>' : ''}`;

    $('#gHand').innerHTML = diceHTML(me.hand, !game.palifico);

    if (b) {
      let extra = '';
      if (b.playerId !== 'human' && me.dice > 0 && assistConfig.showCurrentBidOdds) {
        const p = P.probBidRead(b.quantity, b.face, me.hand, game.players.filter((p, i) => i !== 0 && p.dice > 0).map((p, i) => ({ k: p.dice, faces: game.faces ? game.faces[i + 1] || [] : [] })), !game.palifico, 0.2);
        extra = ` <span class="m">шанс по вашим кубикам и чтению ставок:</span> <b class="${p >= .5 ? 'g' : 'r'}">${pct(p)}</b>`;
      }
      $('#gBid').innerHTML = `${chip(b.quantity, b.face, 'xl')} <span class="m">— ${b.playerName}</span>${extra}`;
    } else {
      $('#gBid').innerHTML = `<span class="m">ставок ещё нет — начните с любой${game.palifico ? '' : ' (кроме единиц)'}</span>`;
    }

    $('#gLog').innerHTML = msg;
    $('#gFeed').innerHTML = game.feed || '';

    const dis = game.over || game.currentPlayer !== 0 || game.locked || me.dice <= 0;
    const calzaOk = game.calzaEnabled && b && b.playerId !== 'human' && totalDice >= Math.ceil(game.config.startDice * game.players.length / 2);

    $('#gDudo').disabled = dis || !b || b.playerId === 'human';
    $('#gCalza').disabled = dis || !calzaOk;
    $('#gCalza').classList.toggle('hide', !game.calzaEnabled);

    renderPick();
    prevG();
  }

  function startNewGame() {
    const botCount = +$('#gBots').value;
    const startDice = +$('#gDice').value;
    const calza = $('#gCalzaOpt').checked;
    const palifico = $('#gPalificoOpt').checked;
    const assistMode = $('#gAssist').value;

    assistConfig = createAssistConfig(assistMode);

    game = createGame({
      playerId: 'human',
      botCount,
      startDice,
      calzaEnabled: calza,
      palificoEnabled: palifico,
      assistMode,
    });

    gameLog = [];
    game.faces = [];

    const events = startGame(game);

    // Генерируем "лица" для ботов
    for (let i = 0; i <= botCount; i++) {
      game.faces.push([]);
    }

    renderGame();
    addLog(`Партия началась. ${botCount + 1} игроков, по ${startDice} кубиков.${calza ? ' Calza включен.' : ''}${palifico ? ' Palifico включен.' : ''}`);

    // Если первый ход бота
    if (game.currentPlayer !== 0) {
      botTurn();
    }
  }

  function botTurn() {
    if (!game || game.over || game.currentPlayer === 0) return;

    const bot = game.players[game.currentPlayer];
    const actions = getLegalActions(game, bot.id);

    if (actions.length === 0) return;

    // Простая логика бота (можно улучшить)
    const action = actions[Math.floor(Math.random() * actions.length)];

    later(() => {
      applyAction(game, bot.id, action);
      renderGame();

      if (game.currentPlayer === 0 && !game.over) {
        addLog(`${bot.name}: ${action.type === 'raise' ? `${action.quantity}×${action.face}` : action.type.toUpperCase()}`, 'bot');
      }

      if (game.currentPlayer !== 0 && !game.over) {
        botTurn();
      }
    }, 1000);
  }

  $('#gDudo').onclick = () => {
    if (!game || game.over || game.currentPlayer !== 0) return;
    applyAction(game, 'human', { type: 'dudo' });
    renderGame();
  };

  $('#gCalza').onclick = () => {
    if (!game || game.over || game.currentPlayer !== 0) return;
    applyAction(game, 'human', { type: 'calza' });
    renderGame();
  };

  $('#gRaise').onclick = () => {
    if (!game || game.over || game.currentPlayer !== 0) return;
    const Q = +$('#gQ').value;
    const F = gFace;
    applyAction(game, 'human', { type: 'raise', quantity: Q, face: F });
    renderGame();

    if (game.currentPlayer !== 0 && !game.over) {
      later(() => botTurn(), 500);
    }
  };

  $('#gNew').onclick = startNewGame;

  $('#gQ').oninput = prevG;

  startNewGame();
}

// ================= Статистика =================

function renderStats() {
  const S = getStats();
  const games = getGames(10);

  $('#stTotal').textContent = S.n || S.totalDecisions || 0;
  $('#stGood').textContent = S.good || S.goodDecisions || 0;
  $('#stQueue').textContent = getTrainingQueue().length;

  let h = '<table><tr><th>Режим</th><th>Всего</th><th>Верно</th><th>Процент</th></tr>';
  for (const [mode, data] of Object.entries(S.byMode || {})) {
    h += `<tr><td>${mode}</td><td>${data.n}</td><td>${data.good}</td><td>${data.n ? ((data.good / data.n) * 100).toFixed(1) + '%' : '—'}</td></tr>`;
  }
  h += '</table>';
  $('#stByMode').innerHTML = h;

  let gh = '<ol>';
  games.forEach((g, i) => {
    gh += `<li>Партия ${i + 1}: ${g.winner || '—'}</li>`;
  });
  gh += '</ol>';
  $('#stGames').innerHTML = gh;
}

// ================= Экспорт/Импорт =================

function setupExportImport() {
  $('#exExport').onclick = () => {
    const data = window.PerudoExport ? window.PerudoExport() : {};
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perudo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  $('#exImport').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (window.PerudoImport) {
            window.PerudoImport(data);
          }
          alert('Данные импортированы!');
        } catch (err) {
          alert('Ошибка импорта: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
}

// ================= Инициализация =================

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupCalculator();
  setupTrainer();
  setupDrill();
  setupGame();
  setupExportImport();
  renderStats();
});

// Экспорт для standalone-версии
window.PerudoExport = () => {
  const P = window.Perudo;
  return {
    stats: getStats(),
    queue: getTrainingQueue(),
    games: getGames(),
    settings: getSettings(),
    exportedAt: Date.now(),
  };
};

window.PerudoImport = (data) => {
  if (data.stats) setStats(data.stats);
  if (data.queue) setTrainingQueue(data.queue);
  if (data.games) {
    const games = getGames(1000);
    games.push(...data.games);
    // Ограничиваем
    if (games.length > 200) games.splice(0, games.length - 200);
    // Сохраняем через set чтобы обойти addGame
    const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
    set('perudo.games', games);
  }
  if (data.settings) setSettings(data.settings);
};
