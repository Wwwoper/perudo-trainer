// situation.test.js — описание ситуации за столом: фазы, баланс, факты, наблюдения, варианты, запрет чужих рук.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describeSituation, START_SHARE } from '../src/situation.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), sandbox);
const P = sandbox.self.Perudo || sandbox.Perudo;

const pl = (id, dice, extra = {}) => ({ id, dice, alive: dice > 0, style: 'smart', ...extra });
/** Стол: вы (место 0), три бота; ставки по порядку. */
function setup({ dice = [5, 5, 5, 5], hand = [1, 2, 2, 4, 6], log = [], palifico = false, settings, rules = { startDice: 5 } } = {}) {
  const players = dice.map((d, i) => pl(i === 0 ? 'human' : `b${i}`, d, { style: ['smart', 'careful', 'bluffer', 'aggressor'][i] }));
  const bid = log.length ? { ...log[log.length - 1] } : null;
  return {
    publicState: { players, bid, palifico },
    myHand: hand.slice(0, dice[0]), bidLog: log, meSeat: 0, rules, settings,
    probBid: P.probBid, probBidRead: P.probBidRead,
  };
}
const bids = (...xs) => xs.map(([playerId, q, f]) => ({ playerId, q, f }));

describe('фаза', () => {
  it('начало: стол почти полный', () => {
    assert.equal(describeSituation(setup()).phase, 'start');
    assert.equal(describeSituation(setup({ dice: [5, 5, 5, 3], hand: [1, 2, 3, 4, 5] })).phase, 'start');   // 18 из 20 ≥ 80 %
    assert.equal(START_SHARE, 0.8);
  });
  it('середина', () => {
    assert.equal(describeSituation(setup({ dice: [3, 3, 3, 2] })).phase, 'mid');
  });
  it('эндшпиль: на столе не больше шести кубиков', () => {
    assert.equal(describeSituation(setup({ dice: [2, 2, 1, 1] })).phase, 'endgame');
    assert.equal(describeSituation(setup({ dice: [3, 3, 1, 0] })).phase, 'mid');   // 7 кубиков — ещё не эндшпиль
  });
  it('Палифико важнее остальных', () => {
    assert.equal(describeSituation(setup({ dice: [1, 1, 1, 1], palifico: true })).phase, 'palifico');
  });
});

describe('баланс', () => {
  it('кубики, лидеры, последние кубики, следующий игрок; выбывшие не считаются', () => {
    const r = describeSituation(setup({ dice: [3, 4, 0, 1], hand: [1, 2, 3] }));
    assert.equal(r.balance.total, 8);
    assert.deepEqual(r.balance.players.map((p) => [p.seat, p.dice, p.isMe]), [[0, 3, true], [1, 4, false], [3, 1, false]]);
    assert.deepEqual(r.balance.leaders, [1]);
    assert.deepEqual(r.balance.lastDice, [3]);
    assert.equal(r.balance.next, 1);
    assert.equal(r.turnAfter, 1);
  });
  it('следующий пропускает выбывшего и идёт по кругу', () => {
    const s = setup({ dice: [3, 2, 2, 2] });
    s.meSeat = 3; s.myHand = [1, 2];
    assert.equal(describeSituation(s).turnAfter, 0);
    const t = setup({ dice: [3, 0, 2, 2] });
    assert.equal(describeSituation(t).turnAfter, 2);
  });
  it('равные лидеры', () => {
    assert.deepEqual(describeSituation(setup()).balance.leaders, [0, 1, 2, 3]);
  });
  it('стили скрыты по умолчанию и включаются настройкой; свой стиль никогда не показывается', () => {
    const hidden = describeSituation(setup());
    assert.ok(hidden.balance.players.every((p) => p.style === null));
    assert.ok(describeSituation(setup({ settings: { hideStyles: true } })).balance.players.every((p) => p.style === null));
    const shown = describeSituation(setup({ settings: { hideStyles: false } }));
    assert.deepEqual(shown.balance.players.map((p) => p.style), [null, 'careful', 'bluffer', 'aggressor']);
  });
});

describe('факты', () => {
  it('рука считается по цифрам', () => {
    const f = describeSituation(setup()).facts.find((x) => x.kind === 'hand');
    assert.deepEqual(f.counts, { 1: 1, 2: 2, 3: 0, 4: 1, 5: 0, 6: 1 });
    assert.equal(f.size, 5);
  });
  it('ожидание: двойки с джокером, скрытые кубики и разрыв', () => {
    const r = describeSituation(setup({ log: bids(['b1', 5, 2]) }));
    const e = r.facts.find((x) => x.kind === 'expectation');
    assert.equal(e.own, 3);           // две двойки и единица-джокер
    assert.equal(e.hidden, 15);
    assert.equal(e.need, 2);
    assert.ok(Math.abs(e.expected - 5) < 1e-9);
    assert.ok(Math.abs(e.gap - (2 - 5)) < 1e-9);
    assert.equal(e.p, 1 / 3);
  });
  it('ожидание: единицы и Палифико — шанс 1/6, джокеров нет', () => {
    const one = describeSituation(setup({ log: bids(['b1', 3, 1]) })).facts.find((x) => x.kind === 'expectation');
    assert.equal(one.p, 1 / 6);
    assert.equal(one.own, 1);
    const pal = describeSituation(setup({ dice: [2, 2, 2, 2], hand: [1, 2], palifico: true, log: bids(['b1', 2, 2]) })).facts.find((x) => x.kind === 'expectation');
    assert.equal(pal.p, 1 / 6);
    assert.equal(pal.own, 1);
  });
  it('нет ставки — нет ожидания и чтения стола', () => {
    const f = describeSituation(setup()).facts;
    assert.deepEqual(f.map((x) => x.kind), ['hand', 'bid_trend']);
  });
  it('динамика ставок: прыжки, смены цифры, последний шаг', () => {
    const r = describeSituation(setup({ log: bids(['b1', 2, 3], ['b2', 3, 3], ['b3', 5, 3], ['b1', 5, 4]) }));
    const t = r.facts.find((x) => x.kind === 'bid_trend');
    assert.deepEqual(t.steps, [{ dq: 1, faceChanged: false }, { dq: 2, faceChanged: false }, { dq: 0, faceChanged: true }]);
    assert.equal(t.jumps, 1);
    assert.equal(t.faceChanges, 1);
    assert.deepEqual(t.last, { dq: 0, faceChanged: true });
  });
  it('одна ставка — шагов нет', () => {
    const t = describeSituation(setup({ log: bids(['b1', 2, 3]) })).facts.find((x) => x.kind === 'bid_trend');
    assert.deepEqual(t.steps, []);
    assert.equal(t.last, null);
  });
  it('чтение стола: шанс с учётом ставок не ниже обычного, когда соперник называл эту цифру', () => {
    const r = describeSituation(setup({ log: bids(['b1', 4, 2]) }));
    const t = r.facts.find((x) => x.kind === 'table_read');
    assert.ok(t.pRead >= t.p);
    assert.ok(t.pRead > t.p);
  });
});

describe('наблюдения', () => {
  it('кто что называл, сколько раз, кто молчит', () => {
    const r = describeSituation(setup({ log: bids(['b1', 2, 3], ['b2', 3, 3], ['b1', 4, 4], ['b3', 5, 4]) }));
    const o = r.observations;
    assert.equal(o.count, 4);
    const b1 = o.players.find((x) => x.id === 'b1');
    assert.deepEqual(b1.faces, { 3: 1, 4: 1 });
    assert.equal(b1.bids, 2);
    assert.deepEqual(b1.last, { q: 4, f: 4 });
    assert.equal(b1.silent, false);
    assert.equal(o.players.find((x) => x.id === 'b2').bids, 1);
  });
  it('ставки без вас; ваши ставки не считаются наблюдениями', () => {
    const r = describeSituation(setup({ log: bids(['human', 1, 2], ['b1', 2, 2]) }));
    assert.equal(r.observations.count, 1);
    assert.ok(r.observations.players.every((p) => p.id !== 'human'));
    assert.equal(r.observations.players.find((p) => p.id === 'b2').silent, true);
  });
  it('первый ход раунда: наблюдений нет', () => {
    const r = describeSituation(setup());
    assert.equal(r.observations.count, 0);
    assert.ok(r.observations.players.every((p) => p.silent && p.last === null));
  });
});

describe('варианты', () => {
  it('«не верю» завершает раунд, повышения передают ход следующему игроку', () => {
    const r = describeSituation(setup({ log: bids(['b3', 6, 4]) }));
    const dudo = r.options.find((o) => o.type === 'dudo');
    assert.equal(dudo.consequence, 'ends_round');
    assert.equal(dudo.passesTo, undefined);
    const raises = r.options.filter((o) => o.type !== 'dudo');
    assert.ok(raises.length >= 1);
    for (const o of raises) { assert.equal(o.consequence, 'passes'); assert.equal(o.passesTo, 1); }
  });
  it('первый ход: «не верю» нет', () => {
    const r = describeSituation(setup());
    assert.ok(r.options.every((o) => o.type !== 'dudo'));
    assert.ok(r.options.length >= 1);
  });
  it('собственная ставка последняя: вариантов нет (ход не ваш)', () => {
    assert.deepEqual(describeSituation(setup({ log: bids(['human', 2, 2]) })).options, []);
  });
  it('порог из настроек', () => {
    const lo = describeSituation(setup({ log: bids(['b1', 6, 3]), settings: { threshold: 0.2 } }));
    const hi = describeSituation(setup({ log: bids(['b1', 6, 3]), settings: { threshold: 0.9 } }));
    assert.notDeepEqual(lo.options, hi.options);
  });
});

describe('запрет скрытой информации', () => {
  it('чужие руки во входе — ошибка', () => {
    const s = setup({ log: bids(['b1', 2, 3]) });
    s.publicState.players[1].hand = [3, 3, 3, 3, 3];
    assert.throws(() => describeSituation(s), /рук/);
    const t = setup(); t.publicState.players[2].hands = [[1]];
    assert.throws(() => describeSituation(t), /рук/);
    const u = setup(); u.publicState.hands = [[1]];
    assert.throws(() => describeSituation(u), /рук/);
  });
  it('результат не зависит от чужих кубиков: меняется только то, что видно за столом', () => {
    const a = describeSituation(setup({ log: bids(['b1', 4, 2]) }));
    const b = describeSituation(setup({ log: bids(['b1', 4, 2]) }));
    assert.deepEqual(a, b);
    // в результате нет ни одного поля с руками соперников
    const keys = new Set();
    (function walk(o) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v); } })(a);
    for (const bad of ['hand', 'hands', 'theirHand']) assert.equal(keys.has(bad), false, bad);
  });
});

describe('детерминизм и неизменность входа', () => {
  it('вход не меняется, повторный вызов даёт то же', () => {
    const s = setup({ log: bids(['b1', 2, 3], ['b2', 4, 3]) });
    const before = JSON.stringify({ ...s, probBid: 0, probBidRead: 0 });
    const r1 = describeSituation(s);
    const r2 = describeSituation(s);
    assert.deepEqual(r1, r2);
    assert.equal(JSON.stringify({ ...s, probBid: 0, probBidRead: 0 }), before);
    r1.balance.players[0].dice = 99;
    assert.equal(s.publicState.players[0].dice, 5);
  });
});

describe('мусор на входе', () => {
  const bad = [
    ['нет probBid', (s) => { s.probBid = null; }, TypeError],
    ['нет publicState', (s) => { s.publicState = null; }, TypeError],
    ['один игрок', (s) => { s.publicState.players = [s.publicState.players[0]]; }, RangeError],
    ['семь игроков', (s) => { s.publicState.players = Array.from({ length: 7 }, (_, i) => pl(`p${i}`, 1)); }, RangeError],
    ['игрок без id', (s) => { s.publicState.players[1].id = 5; }, TypeError],
    ['повтор id', (s) => { s.publicState.players[1].id = 'human'; }, RangeError],
    ['meSeat вне стола', (s) => { s.meSeat = 9; }, RangeError],
    ['meSeat дробный', (s) => { s.meSeat = 0.5; }, RangeError],
    ['вы выбыли', (s) => { s.publicState.players[0].alive = false; }, RangeError],
    ['рука не по числу кубиков', (s) => { s.myHand = [1, 2]; }, RangeError],
    ['грань 7 в руке', (s) => { s.myHand = [1, 2, 3, 4, 7]; }, RangeError],
    ['bidLog не массив', (s) => { s.bidLog = null; }, TypeError],
    ['ставка в bidLog с неизвестным автором', (s) => { s.bidLog = bids(['ghost', 1, 2]); s.publicState.bid = { playerId: 'ghost', q: 1, f: 2 }; }, TypeError],
    ['ставка bidLog не сходится с текущей', (s) => { s.publicState.bid = { playerId: 'b1', q: 9, f: 2 }; }, RangeError],
    ['ставки есть, текущей нет', (s) => { s.publicState.bid = null; }, RangeError],
  ];
  for (const [name, mut, Err] of bad) {
    it(name, () => {
      const s = setup({ log: bids(['b1', 2, 3]) });
      mut(s);
      assert.throws(() => describeSituation(s), Err);
    });
  }
});

describe('согласованность с игрой: всё сходится на случайных столах', () => {
  it('300 случайных ситуаций: инварианты', () => {
    let seed = 99;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    for (let i = 0; i < 300; i++) {
      const n = int(2, 5);
      const dice = Array.from({ length: n }, () => int(1, 5));
      const hand = Array.from({ length: dice[0] }, () => int(1, 6));
      const players = dice.map((d, k) => pl(k === 0 ? 'human' : `b${k}`, d));
      const log = [];
      let q = 0;
      const steps = int(0, 4);
      for (let k = 0; k < steps; k++) { q += int(1, 2); log.push({ playerId: `b${int(1, n - 1)}`, q, f: int(1, 6) }); }
      const total = dice.reduce((a, b) => a + b, 0);
      if (q > total) continue;
      const wild = rnd() < 0.8;
      const r = describeSituation({
        publicState: { players, bid: log.at(-1) ?? null, palifico: !wild }, myHand: hand, bidLog: log, meSeat: 0,
        rules: { startDice: 5 }, probBid: P.probBid,
      });
      assert.equal(r.balance.total, total);
      assert.equal(r.balance.players.length, n);
      assert.ok(r.balance.leaders.every((s) => dice[s] === Math.max(...dice)));
      assert.equal(r.observations.count, log.length);
      assert.ok(['start', 'mid', 'endgame', 'palifico'].includes(r.phase));
      for (const o of r.options) assert.ok(o.p >= 0 && o.p <= 1);
    }
  });
});
