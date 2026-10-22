// emulators.test.js — эмуляторы из tools/ против логики приложения.
// tools/emu_cases.py (Python-порт) выдаёт случайные входы и свои ответы; здесь те же входы идут через src/.
// Расхождение — значит, эмулятор устарел (или в приложении изменилась логика): обновите tools/*.py.
// Без python3 тест пропускается.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { legal, minLegal } from '../src/rules.js';
import { botDecide, BOT_STYLES } from '../src/bots.js';
import { compareOptions } from '../src/compare.js';
import { createGame, startGame, applyAction, canCalza } from '../src/engine.js';
import { safeByRule, isHalfway } from '../src/drill_rule.js';
import { checkRaise, defaultRaise } from '../src/trainer_rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), sandbox);
const P = sandbox.self.Perudo || sandbox.Perudo;

const py = spawnSync('python3', [path.join(root, 'tools/emu_cases.py')], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const skip = py.error || py.status !== 0 ? 'python3 недоступен или tools/emu_cases.py завершился с ошибкой' : false;
const D = skip ? null : JSON.parse(py.stdout);

const seqRng = (a) => { let i = 0; return () => a[i++]; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const shape = (o) => [o.type, o.q ?? null, o.f ?? null, +o.p.toFixed(9), !!o.isBestSafe];

describe('эмуляторы против приложения', { skip }, () => {
  it('tools/emu_cases.py отработал без ошибок', () => {
    assert.equal(py.status, 0, py.stderr);
  });

  it('rules.js: legal и minLegal', () => {
    for (const c of D.cases) {
      assert.equal(legal(c.q, c.f, c.b, { wild: c.wild }), c.legal, JSON.stringify(c));
      assert.deepEqual(minLegal(c.b, c.n, { wild: c.wild }), c.minLegal, JSON.stringify(c));
    }
  });

  it('core.js: probBid и bestBid', () => {
    for (const c of D.cases) {
      if (c.prob === undefined) continue;
      assert.ok(near(P.probBid(c.q, c.f, c.n, c.h, c.wild), c.prob), JSON.stringify(c));
      assert.equal(P.bestBid(c.f, c.n, c.h, c.wild, c.thr), c.bestBid, JSON.stringify(c));
    }
  });

  it('compare.js: варианты хода', () => {
    for (const c of D.cases.filter((x) => x.cmp)) {
      const { options } = compareOptions({ bid: c.b, total: c.n, hand: c.h, wild: c.wild, threshold: c.thr, probBid: (...a) => P.probBid(...a) });
      const js = options.map(shape);
      const emu = c.cmp.map(shape);
      assert.deepEqual(js, emu, JSON.stringify(c));
    }
  });

  it('drill_rule.js: безопасная ставка по правилу и «ровно посередине»', () => {
    for (const r of D.rule) {
      assert.equal(safeByRule(r.own, r.unk, r.f), r.safe, JSON.stringify(r));
      assert.equal(isHalfway(r.own, r.unk, r.f), r.half, JSON.stringify(r));
    }
  });

  it('trainer_rules.js: проверка ставки (то же сообщение) и поля по умолчанию', () => {
    for (const c of D.raises) {
      const cur = { n: c.n, q: c.q, f: c.f, m: { wild: c.wild } };
      const r = checkRaise(c.Q, c.F, cur);
      assert.equal(r.ok ? null : r.message, c.message, JSON.stringify(c));
      assert.deepEqual(defaultRaise(cur), c.default, JSON.stringify(c));
    }
  });

  it('bots.js: решение botDecide на общем потоке случайных чисел', () => {
    for (const c of D.bots) {
      const d = botDecide({
        hand: c.h, publicState: { totalDice: c.n }, bid: c.b, rules: { wild: c.wild }, style: BOT_STYLES[c.style],
        noise: c.lvl, canCalza: c.cz && !!c.b, rng: seqRng(c.seq),
      });
      assert.equal(d.type, c.type, JSON.stringify(c));
      if (c.type === 'raise') assert.deepEqual([d.q, d.f], [c.q, c.f], JSON.stringify(c));
    }
  });

  it('engine.js + bots.js: партии совпадают с эмулятором ход в ход', () => {
    for (const [gi, g] of D.games.entries()) {
      const realRandom = Math.random;
      const game = createGame({ botCount: 3, startDice: g.dice, calzaEnabled: g.calza, palificoEnabled: g.pal });
      game.players.forEach((p, i) => { p.style = g.styles[i]; });
      Math.random = seqRng(g.seq);
      const log = [];
      try {
        startGame(game);
        let guard = 0;
        while (game.state === 'active' && guard++ < 5000) {
          const idx = game.currentPlayer;
          const bot = game.players[idx];
          const total = game.players.reduce((s, p) => s + p.dice, 0);
          const d = botDecide({
            hand: bot.hand, publicState: { totalDice: total }, bid: game.bid ? { q: game.bid.q, f: game.bid.f } : null,
            rules: { wild: !game.palifico }, style: BOT_STYLES[bot.style], noise: 1,
            canCalza: game.calzaEnabled && !!game.bid && game.bid.playerId !== bot.id && canCalza(game),
          });
          let act = d.type === 'raise' ? { type: 'raise', quantity: d.q, face: d.f } : { type: d.type };
          if (!applyAction(game, bot.id, act).success) {
            const m = minLegal(game.bid, total, { wild: !game.palifico });
            act = game.bid && game.bid.playerId !== bot.id ? { type: 'dudo' } : m ? { type: 'raise', quantity: m.q, face: m.f } : { type: 'dudo' };
            applyAction(game, bot.id, act);
          }
          log.push([game.round, idx, act.type, act.quantity ?? null, act.face ?? null]);
        }
      } finally {
        Math.random = realRandom;
      }
      assert.deepEqual(log, g.log, `партия ${gi}`);
      assert.equal(game.players.findIndex((p) => p.id === game.winner), g.winner, `победитель партии ${gi}`);
    }
  });
});
