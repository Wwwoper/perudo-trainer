// src/app_v2.js — точка входа Perudo Trainer v2
// ES-модуль. Работает и при прямом подключении, и после сборки build.py.

import { createGame, startGame, applyAction, canCalza as engineCanCalza }
  from './engine.js';
import { legal, minLegal } from './rules.js';
import { createAssistConfig, getClassification } from './assist.js';
import { updateStats, migrateIfNeeded, get, set } from './storage.js';
import { BOT_STYLES, generateCharacter, botDecide } from './bots.js';
import { renderTable, renderDie, renderHand, renderBid, escapeHtml } from './table.js';
import { buildGameResult, resultHeadline } from './result.js';
import { P, $, $$, pct, flash } from './ui/common.js';
import { setupTabs } from './ui/tabs.js';
import { setupCalculator } from './ui/calculator.js';
import { setupTrainer } from './ui/trainer.js';
import { setupDrill } from './ui/drill.js';
import { setupDuel, solveNow, startDuel, moveDuel, getDuelTree, getDuelState } from './ui/duel.js';
import { setupSim } from './ui/sim.js';
import { sideApi, setupSidePanel } from './ui/side_panel.js';
import { revealIsOpen, presentReveal, setupReveal, hideRevealUi } from './ui/reveal_dialog.js';
import { setupResultDialog, hideResultUi, scheduleResultDialog } from './ui/result_dialog.js';
import { botCountSetting, setupBotStyles, chosenBotStyles } from './ui/bot_styles.js';
import { setupBotMind, clearBotMemoryState, applyBotMindSettings, botMindFor, observeReveal } from './ui/bot_mind.js';
import { renderStats, setupStats } from './ui/stats.js';

// ================= Инициализация =================

migrateIfNeeded();

let assistConfig = createAssistConfig('training');

// ================= Партия (движок + стол) =================

let game = null;
let gameLogEntries = [];
let reviewEntries = [];
let selectedFace = 2;
let botTimer = null;
let lastBidKey = '';

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
  setupResultDialog(() => game);
  setupReveal(() => {
    continueFlow();
    // Партия закончилась этим вскрытием: окно итога — после него, а не поверх.
    if (game && game.state === 'finished') scheduleResultDialog(() => game, 300);
  });
  startNewGame();
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
  applyBotMindSettings();

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

  observeReveal(res.events, game);
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
  presentReveal(game, res.events);
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
  presentReveal(game, res.events);
  continueFlow();
}

// ----- Вскрытие кубиков после «Не верю» / Calza -----

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
      ...botMindFor(game),
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
    observeReveal(res.events, game);
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
  if (action.type !== 'raise') presentReveal(game, res.events);
  continueFlow();
}

// ----- Финализация -----

// Итог партии подводится один раз: renderGame() вызывается много раз, в том числе
// уже после финала, и без этой защиты история и статистика дублировались бы.
let finalizedGameId = null;
const RESULT_DIALOG_DELAY_MS = 700;

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
  scheduleResultDialog(() => game, RESULT_DIALOG_DELAY_MS);
}

// ================= Точка входа =================

function bootstrap() {
  setupTabs((tab) => { if (tab === 'stats') renderStats(); });
  setupCalculator();
  setupTrainer();
  setupDrill();
  setupSidePanel(() => assistConfig.showFutureBidOdds);
  setupGame();
  setupDuel();
  setupStats({
    onReset: clearBotMemoryState,
  });
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
  get duelTree() { return getDuelTree(); },
  get duelState() { return getDuelState(); },
  startNewGame,
  renderGame,
  solveNow,
  startDuel,
  moveDuel,
};