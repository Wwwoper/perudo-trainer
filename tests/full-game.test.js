// tests/full-game.test.js — полные партии через engine.js + bots.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame, startGame, applyAction,
} from '../src/engine.js';
import { BOT_STYLES, botDecide } from '../src/bots.js';

const MAX_STEPS = 10_000;

const totalDice = (game) =>
  game.players.reduce((s, p) => s + p.dice, 0);

// engine.js хранит bid как {q, f, playerId, playerName}; botDecide ждёт {q, f}.
const bidForBot = (bid) => (bid ? { q: bid.q, f: bid.f } : null);

// Приводим решение бота к формату действия движка.
function decideAction(game, playerIndex) {
  const player = game.players[playerIndex];

  // Публичная информация: у каждого соперника столько-то кубиков,
  // какие цифры он объявлял — не отслеживаем в этом тесте (faces: []).
  const opps = game.players
    .map((p, i) => ({ i, p }))
    .filter(({ i, p }) => i !== playerIndex && p.alive)
    .map(({ p }) => ({ k: p.dice, faces: [] }));

  const decision = botDecide({
    hand: player.hand.slice(),
    publicState: { totalDice: totalDice(game) },
    bid: bidForBot(game.bid),
    rules: { wild: !game.palifico },
    style: BOT_STYLES[player.style] || BOT_STYLES.smart,
    opps,
    canCalza:
      game.calzaEnabled &&
      !!game.bid &&
      game.bid.playerId !== player.id &&
      totalDice(game) >=
      Math.ceil((game.config.startDice * game.players.length) / 2),
  });

  if (decision.type === 'raise') {
    return { type: 'raise', quantity: decision.q, face: decision.f };
  }
  if (decision.type === 'calza') return { type: 'calza' };
  return { type: 'dudo' };
}

// Инварианты, которые должны держаться после каждого действия.
function checkInvariants(game, step) {
  const startDice = game.config.startDice;

  for (const p of game.players) {
    assert.ok(p.dice >= 0, `[${step}] отрицательные кубики у ${p.name}`);
    assert.ok(
      p.dice <= startDice,
      `[${step}] у ${p.name} ${p.dice} > старта ${startDice} (Calza переборщила?)`
    );
    assert.strictEqual(
      p.alive,
      p.dice > 0,
      `[${step}] alive не совпадает с dice у ${p.name}`
    );
  }

  assert.ok(totalDice(game) >= 1, `[${step}] кубиков на столе не осталось`);

  assert.ok(
    game.state === 'active' || game.state === 'finished',
    `[${step}] неожиданный state: ${game.state}`
  );

  if (game.state === 'active') {
    assert.ok(
      game.players[game.currentPlayer].alive,
      `[${step}] ход передан выбывшему игроку`
    );
  }
}

// Прогон одной партии до конца.
function playFullGame(config) {
  const game = createGame({ playerId: 'human', ...config });
  startGame(game);

  let steps = 0;
  while (game.state !== 'finished') {
    if (++steps > MAX_STEPS) {
      throw new Error(`партия не завершилась за ${MAX_STEPS} шагов`);
    }

    const player = game.players[game.currentPlayer];
    const action = decideAction(game, game.currentPlayer);

    const res = applyAction(game, player.id, action);
    assert.ok(
      res.success,
      `[${steps}] действие отклонено: ${res.error} — ${JSON.stringify(action)}`
    );

    checkInvariants(game, steps);
  }

  return { game, steps };
}

// ---------------------------------------------------------------------------
// Сценарии
// ---------------------------------------------------------------------------

describe('Полная партия через engine + bots', () => {
  test('4 игрока, базовые правила — партия завершается, победитель один', () => {
    const { game } = playFullGame({ botCount: 3, startDice: 3 });
    const alive = game.players.filter((p) => p.alive);
    assert.strictEqual(alive.length, 1);
    assert.strictEqual(game.winner, alive[0].id);
  });

  test('6 игроков, 5 кубиков', () => {
    const { game } = playFullGame({ botCount: 5, startDice: 5 });
    assert.strictEqual(game.players.filter((p) => p.alive).length, 1);
  });

  test('2 игрока, 1 кубик — короткий эндшпиль', () => {
    const { game, steps } = playFullGame({ botCount: 1, startDice: 1 });
    assert.strictEqual(game.players.filter((p) => p.alive).length, 1);
    assert.ok(steps < 100, `слишком долго: ${steps} шагов`);
  });

  test('Calza включён', () => {
    const { game } = playFullGame({
      botCount: 3,
      startDice: 3,
      calzaEnabled: true,
    });
    assert.strictEqual(game.players.filter((p) => p.alive).length, 1);
  });

  test('Palifico включён', () => {
    const { game } = playFullGame({
      botCount: 3,
      startDice: 3,
      palificoEnabled: true,
    });
    assert.strictEqual(game.players.filter((p) => p.alive).length, 1);
  });
});

// ...
describe('Фаззинг: 10 000 случайных партий', () => {
  // Управляется переменной окружения FUZZ_ITERS — удобно для быстрого CI.
  const ITERS = Number(process.env.FUZZ_ITERS || 10_000);

  test(`инварианты держатся на ${ITERS} партиях`, () => {
    const failures = [];
    for (let i = 0; i < ITERS; i++) {
      const cfg = {
        botCount: 1 + Math.floor(Math.random() * 5),
        startDice: 1 + Math.floor(Math.random() * 5),
        calzaEnabled: Math.random() < 0.5,
        palificoEnabled: Math.random() < 0.5,
      };
      try {
        const { game } = playFullGame(cfg);
        assert.strictEqual(
          game.players.filter((p) => p.alive).length, 1,
          `некорректный финал для ${JSON.stringify(cfg)}`
        );
      } catch (e) {
        failures.push({ cfg, message: e.message });
        if (failures.length >= 5) break; // хватит для отладки
      }
    }
    if (failures.length) {
      assert.fail(`Провалено ${failures.length} партий:\n` + JSON.stringify(failures, null, 2));
    }
  });
});

describe('P0.2 — Palifico не залипает между раундами', () => {
  test('после Palifico следующий раунд снова с джокерами', () => {
    // 4 игрока, Palifico включён. Прокрутим партию, пока Palifico не случится.
    const game = createGame({ playerId: 'human', botCount: 3, startDice: 3, palificoEnabled: true });
    startGame(game);

    let sawPalifico = false;
    let sawNormalAfterPalifico = false;
    let prevPalifico = false;

    for (let step = 0; step < 2000 && game.state !== 'finished'; step++) {
      if (game.palifico && !prevPalifico) sawPalifico = true;
      if (sawPalifico && !game.palifico && prevPalifico) sawNormalAfterPalifico = true;
      prevPalifico = game.palifico;

      const player = game.players[game.currentPlayer];
      const action = decideAction(game, game.currentPlayer);
      const res = applyAction(game, player.id, action);
      assert.ok(res.success, res.error);
    }

    // Palifico в этой конфигурации не гарантирован — пропускаем, если не случился.
    if (!sawPalifico) return;
    assert.ok(sawNormalAfterPalifico, 'Palifico остался включён навсегда');
  });
});

describe('Точечные сценарии', () => {
  test('после dudo ровно один игрок теряет ровно один кубик', () => {
    const game = createGame({ playerId: 'human', botCount: 1, startDice: 3 });
    startGame(game);

    assert.strictEqual(game.currentPlayer, 0);
    const before = game.players.map((p) => p.dice);

    assert.ok(
      applyAction(game, 'human', { type: 'raise', quantity: 1, face: 2 }).success
    );
    assert.ok(applyAction(game, 'bot_0', { type: 'dudo' }).success);

    const lost = before.map((b, i) => b - game.players[i].dice);
    assert.strictEqual(lost.filter((x) => x === 1).length, 1);
    assert.strictEqual(lost.filter((x) => x !== 0 && x !== 1).length, 0);
  });

  test('выбывший игрок не может ходить', () => {
    const game = createGame({ playerId: 'human', botCount: 1, startDice: 1 });
    startGame(game);

    applyAction(game, 'human', { type: 'raise', quantity: 1, face: 2 });
    applyAction(game, 'bot_0', { type: 'dudo' });

    const dead = game.players.find((p) => !p.alive);
    if (dead) {
      const res = applyAction(game, dead.id, { type: 'dudo' });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /eliminated|not active|Not your turn/i);
    }
  });
});