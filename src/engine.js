// engine.js — игровой движок Perudo
// Отделяет логику игры от UI, работает без браузера.
// Использует rules.js для проверки допустимости ходов.
//
// ВАЖНО: game.bid хранится в формате { q, f, playerId, playerName } —
// именно {q, f}, потому что так его ожидает legal() из rules.js.

import { legal, minLegal, onesDown, onesUp } from './rules.js';

const MAX_EVENTS = 1000; // Ограничение журнала событий (P1.7)

// ================= Модели данных =================

export function createGame(config) {
  const {
    playerId = 'human',
    botCount = 1,
    startDice = 5,
    calzaEnabled = false,
    palificoEnabled = false,
    assistMode = 'training',
    botSpeed = 'normal',
    botNames = null,
  } = config;

  const players = [];

  players.push({
    id: playerId,
    name: 'Вы',
    hand: [],
    dice: startDice,
    alive: true,
    isBot: false,
    palificoUsed: false,
  });

  const defaultNames = ['Алексей', 'Мария', 'Дмитрий', 'Ольга', 'Иван', 'Анна'];
  const names = botNames || defaultNames;
  for (let i = 0; i < botCount; i++) {
    players.push({
      id: `bot_${i}`,
      name: names[i] || `Бот ${i + 1}`,
      hand: [],
      dice: startDice,
      alive: true,
      isBot: true,
      style: ['careful', 'bluffer', 'smart'][i % 3],
      palificoUsed: false,
    });
  }

  return {
    id: `game_${Date.now()}`,
    config,
    players,
    currentPlayer: 0,
    round: 0,
    bid: null,
    bidHistory: [],
    palifico: false,
    palificoStarter: null,
    palificoFace: null,
    calzaEnabled,
    palificoEnabled,
    assistMode,
    botSpeed,
    state: 'waiting',
    winner: null,
    log: [],
    events: [],
  };
}

// ================= Вспомогательные функции =================

function countDice(game) {
  return game.players.reduce((sum, p) => sum + p.dice, 0);
}

function nextAlivePlayer(game, fromIndex) {
  let i = fromIndex;
  do {
    i = (i + 1) % game.players.length;
  } while (!game.players[i].alive);
  return i;
}

function alivePlayers(game) {
  return game.players.filter((p) => p.alive);
}

function rollDice(k, rng = Math.random) {
  return Array.from({ length: k }, () => 1 + Math.floor(rng() * 6));
}

// ================= События =================

function emitEvent(game, event) {
  game.events.push({
    ...event,
    timestamp: Date.now(),
    round: game.round,
  });
}

// Аккуратно режем журнал после завершения applyAction,
// чтобы не порвать слайс [beforeLen, afterLen] посреди операции.
function trimEvents(game) {
  if (game.events.length > MAX_EVENTS) {
    game.events.splice(0, game.events.length - MAX_EVENTS);
  }
}

function addLog(game, message, type = 'info') {
  game.log.push({ round: game.round, message, type });
}

/* =============================================================
   Calza — единое условие доступности.
   Раньше UI считал одно, движок — другое (без порога кубиков).
   Теперь одна функция, используется и в getLegalActions, и в UI.
   ============================================================= */
export function canCalza(game) {
  if (!game.calzaEnabled || !game.bid) return false;
  if (game.bid.playerId === 'human' && game.currentPlayer === 0) return false;
  const minTotal = Math.ceil(game.config.startDice * game.players.length / 2);
  return countDice(game) >= minTotal;
}

// ================= Публичные API =================

export function startGame(game) {
  if (game.state !== 'waiting') return [];
  game.state = 'active';
  emitEvent(game, { type: 'GAME_STARTED', gameId: game.id });
  return startRound(game, 0);
}

export function startRound(game, starterId) {
  const events = [];
  const totalDice = countDice(game);

  const alive = alivePlayers(game);
  if (alive.length === 1) {
    game.state = 'finished';
    game.winner = alive[0].id;
    emitEvent(game, { type: 'GAME_ENDED', winner: alive[0].id });
    addLog(game, `Партия завершена. Победитель: ${alive[0].name}`, 'win');
    return events;
  }

  let starterIndex = starterId;
  if (typeof starterId === 'string') {
    starterIndex = game.players.findIndex((p) => p.id === starterId);
  }
  if (starterIndex < 0 || !game.players[starterIndex].alive) {
    starterIndex = nextAlivePlayer(game, game.currentPlayer - 1);
  }

  // Раздача
  game.players.forEach((p) => {
    if (p.alive) {
      p.hand = rollDice(p.dice);
      emitEvent(game, { type: 'DICE_ROLLED', playerId: p.id, diceCount: p.dice });
    }
  });

  // Сброс ставки
  game.bid = null;
  game.bidHistory = [];
  game.palificoStarter = null;
  game.palificoFace = null;

  // P0.2: Palifico действует ровно один раунд.
  // Сбрасываем флаг и включаем его заново только при «переходе к 1 кубику»,
  // который отслеживается per-player флагом palificoUsed.
  game.palifico = false;

  if (game.palificoEnabled) {
    const oneDiePlayer = game.players.find((p) => p.alive && p.dice === 1 && !p.palificoUsed);
    if (oneDiePlayer && alive.length > 2) {
      game.palifico = true;
      oneDiePlayer.palificoUsed = true;
      starterIndex = game.players.findIndex((p) => p.id === oneDiePlayer.id);
      emitEvent(game, { type: 'PALIFICO_STARTED', playerId: oneDiePlayer.id });
      addLog(game, 'ПАЛИФИКО: единицы не джокеры, цифра фиксируется', 'warn');
    }
  }

  game.currentPlayer = starterIndex;
  game.round++;

  emitEvent(game, {
    type: 'ROUND_STARTED',
    round: game.round,
    starter: game.players[starterIndex].id,
    totalDice,
    palifico: game.palifico,
  });

  addLog(
    game,
    `Раунд ${game.round}. Всего кубиков: ${totalDice}.${game.palifico ? ' ПАЛИФИКО!' : ''}`,
    'round'
  );

  game.state = 'active';
  return events;
}

export function getLegalActions(game, playerId) {
  const playerIndex = game.players.findIndex((p) => p.id === playerId);
  if (playerIndex < 0 || !game.players[playerIndex].alive || game.currentPlayer !== playerIndex) {
    return [];
  }

  const actions = [];
  const rules = { wild: !game.palifico };

  if (game.bid && game.bid.playerId !== playerId) {
    actions.push({ type: 'dudo' });
  }

  // P0.4: условие доступности Calza берём из единой функции.
  if (game.calzaEnabled && game.bid && game.bid.playerId !== playerId && canCalza(game)) {
    actions.push({ type: 'calza' });
  }

  for (let q = 1; q <= countDice(game); q++) {
    for (let f = 1; f <= 6; f++) {
      if (legal(q, f, game.bid, rules)) {
        actions.push({ type: 'raise', quantity: q, face: f });
      }
    }
  }

  return actions;
}

export function applyAction(game, playerId, action) {
  if (game.state !== 'active') {
    return { success: false, error: 'Game not active' };
  }

  const playerIndex = game.players.findIndex((p) => p.id === playerId);
  if (playerIndex < 0 || !game.players[playerIndex].alive) {
    return { success: false, error: 'Player not found or eliminated' };
  }

  if (game.currentPlayer !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }

  const rules = { wild: !game.palifico };

  if (action.type === 'raise') {
    if (!legal(action.quantity, action.face, game.bid, rules)) {
      return { success: false, error: 'Invalid bid' };
    }
  } else if (action.type === 'dudo' || action.type === 'calza') {
    if (!game.bid || game.bid.playerId === playerId) {
      return { success: false, error: 'Cannot challenge your own bid' };
    }
    if (action.type === 'calza' && !canCalza(game)) {
      return { success: false, error: 'Calza not available' };
    }
  }

  // P1.7: захватываем только события, выпущенные внутри этого действия,
  // и только после этого подрезаем журнал. Так app_v2 может безопасно
  // читать res.events и не полагаться на хрупкий game.events.slice().
  const beforeLen = game.events.length;

  const player = game.players[playerIndex];

  if (action.type === 'raise') {
    game.bid = {
      playerId: player.id,
      playerName: player.name,
      q: action.quantity,
      f: action.face,
    };
    game.bidHistory.push(game.bid);

    emitEvent(game, {
      type: 'BID_PLACED',
      playerId: player.id,
      quantity: action.quantity,
      face: action.face,
    });

    addLog(game, `${player.name}: ${action.quantity}×${action.face}`, 'bid');
    game.currentPlayer = nextAlivePlayer(game, playerIndex);
  } else if (action.type === 'dudo') {
    emitEvent(game, { type: 'DUDO_CALLED', challenger: player.id, bid: game.bid });
    addLog(game, `${player.name}: НЕ ВЕРЮ!`, 'dudo');
    resolveDudo(game);
  } else if (action.type === 'calza') {
    emitEvent(game, { type: 'CALZA_CALLED', challenger: player.id, bid: game.bid });
    addLog(game, `${player.name}: CALZA!`, 'calza');
    resolveCalza(game, playerIndex);
  }

  const newEvents = game.events.slice(beforeLen);
  trimEvents(game);

  return { success: true, events: newEvents };
}

function resolveDudo(game) {
  const bid = game.bid;
  const bidPlayerIndex = game.players.findIndex((p) => p.id === bid.playerId);
  const challengerIndex = game.currentPlayer;

  const wild = !game.palifico;
  let count = 0;
  game.players.forEach((p) => {
    if (p.alive) {
      p.hand.forEach((die) => {
        if (die === bid.f || (wild && die === 1 && bid.f !== 1)) count++;
      });
    }
  });

  const bidSuccessful = count >= bid.q;
  const loserIndex = bidSuccessful ? challengerIndex : bidPlayerIndex;

  emitEvent(game, {
    type: 'DICE_REVEALED',
    bid,
    actualCount: count,
    bidSuccessful,
  });

  game.players[loserIndex].dice--;
  emitEvent(game, {
    type: 'PLAYER_LOST_DIE',
    playerId: game.players[loserIndex].id,
    newDiceCount: game.players[loserIndex].dice,
  });

  if (game.players[loserIndex].dice <= 0) {
    game.players[loserIndex].alive = false;
    game.players[loserIndex].dice = 0;
    emitEvent(game, { type: 'PLAYER_ELIMINATED', playerId: game.players[loserIndex].id });
    addLog(game, `${game.players[loserIndex].name} выбывает`, 'eliminate');
  }

  game.state = 'round_resolving';
  addLog(
    game,
    `На столе: ${count} кубиков. ${bidSuccessful ? 'Ставка верна' : 'Ставка неверна'}`,
    'result'
  );

  startRound(game, loserIndex);
}

function resolveCalza(game, challengerIndex) {
  const bid = game.bid;

  const wild = !game.palifico;
  let count = 0;
  game.players.forEach((p) => {
    if (p.alive) {
      p.hand.forEach((die) => {
        if (die === bid.f || (wild && die === 1 && bid.f !== 1)) count++;
      });
    }
  });

  const exact = count === bid.q;
  emitEvent(game, {
    type: 'DICE_REVEALED',
    bid,
    actualCount: count,
    calzaExact: exact,
  });

  const challenger = game.players[challengerIndex];

  if (exact) {
    const maxDice = game.config.startDice;
    if (challenger.dice < maxDice) {
      challenger.dice++;
      // Возврат к >1 кубику разрешает снова «зажечь» Palifico позже.
      if (challenger.dice > 1) challenger.palificoUsed = false;
      emitEvent(game, {
        type: 'PLAYER_GAINED_DIE',
        playerId: challenger.id,
        newDiceCount: challenger.dice,
      });
      addLog(game, `CALZA верен! ${challenger.name} получает кубик`, 'success');
    } else {
      addLog(game, `CALZA верен! Но у ${challenger.name} уже максимум кубиков`, 'info');
    }
  } else {
    challenger.dice--;
    emitEvent(game, {
      type: 'PLAYER_LOST_DIE',
      playerId: challenger.id,
      newDiceCount: challenger.dice,
    });
    addLog(game, `CALZA неверен (${count} вместо ${bid.q}). ${challenger.name} теряет кубик`, 'error');
    if (challenger.dice <= 0) {
      challenger.alive = false;
      challenger.dice = 0;
      emitEvent(game, { type: 'PLAYER_ELIMINATED', playerId: challenger.id });
    }
  }

  const nextStarter = exact
    ? game.players.findIndex((p) => p.id === bid.playerId)
    : challengerIndex;

  game.state = 'round_resolving';
  startRound(game, nextStarter);
}

export function getPublicState(game) {
  return {
    id: game.id,
    round: game.round,
    currentPlayer: game.currentPlayer,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      dice: p.dice,
      alive: p.alive,
      isBot: p.isBot,
      style: p.style,
    })),
    bid: game.bid,
    bidHistory: game.bidHistory,
    palifico: game.palifico,
    calzaEnabled: game.calzaEnabled,
    totalDice: countDice(game),
    state: game.state,
    winner: game.winner,
  };
}

export function getPrivateState(game, playerId) {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return null;
  return {
    hand: player.hand,
    legalActions: getLegalActions(game, playerId),
  };
}

export { legal, minLegal, onesDown, onesUp };