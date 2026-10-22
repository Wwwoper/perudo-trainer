// table_read.test.js — «чтение стола» в «Разборе».
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TABLE_TRUST, opponentsFromBids, ownMatching, readInfo, readNote } from '../src/table_read.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(here, '../src/core.js'), 'utf8'), sandbox);
const P = sandbox.self.Perudo || sandbox.Perudo;

const players = [
  { id: 'human', dice: 5, alive: true },
  { id: 'b1', dice: 2, alive: true },
  { id: 'b2', dice: 3, alive: true },
  { id: 'b3', dice: 2, alive: false },
];

describe('opponentsFromBids', () => {
  it('соперники без человека и выбывших, цифры без повторов', () => {
    const hist = [
      { playerId: 'b1', q: 2, f: 6 }, { playerId: 'b2', q: 3, f: 6 },
      { playerId: 'human', q: 4, f: 6 }, { playerId: 'b1', q: 5, f: 6 }, { playerId: 'b2', q: 6, f: 4 },
    ];
    assert.deepEqual(opponentsFromBids(players, hist, 'human'), [
      { k: 2, faces: [6] }, { k: 3, faces: [6, 4] },
    ]);
  });
  it('первая ставка раунда: цифр нет', () => {
    assert.deepEqual(opponentsFromBids(players, [], 'human'), [{ k: 2, faces: [] }, { k: 3, faces: [] }]);
  });
  it('мусор на входе не ломает', () => {
    assert.deepEqual(opponentsFromBids(null, undefined, 'human'), []);
    assert.deepEqual(opponentsFromBids([{ id: 'x', dice: 'a', alive: true }], [null], 'human'), []);
  });
});

describe('ownMatching', () => {
  it('джокеры считаются только когда единицы — джокеры', () => {
    assert.equal(ownMatching([1, 6, 6, 2], 6, true), 3);
    assert.equal(ownMatching([1, 6, 6, 2], 6, false), 2);
    assert.equal(ownMatching([1, 1, 2], 1, true), 2);
  });
});

describe('readInfo (пример из отчёта: Палифико, 12 кубиков, у вас 5 с одной шестёркой, ставка 4×6)', () => {
  const hand = [6, 2, 3, 4, 5];
  const pl = [{ id: 'human', dice: 5, alive: true }, { id: 'b1', dice: 4, alive: true }, { id: 'b2', dice: 3, alive: true }];
  const hist = [{ playerId: 'b1', q: 2, f: 6 }, { playerId: 'b2', q: 3, f: 6 }];
  const args = { q: 4, f: 6, hand, players: pl, bidHistory: hist, meId: 'human', wild: false };

  it('обычная вероятность 9.58%', () => {
    assert.equal((P.probBid(4, 6, 12, hand, false) * 100).toFixed(2), '9.58');
  });
  it('с учётом стола вероятность выше обычной', () => {
    const r = readInfo(P.probBidRead, args);
    assert.ok(r.probRead > P.probBid(4, 6, 12, hand, false));
    assert.equal(r.trust, TABLE_TRUST);
    assert.equal(r.handSize, 5);
    assert.equal(r.ownMatch, 1);
  });
  it('при trust = 0 обе вероятности равны', () => {
    const r = readInfo(P.probBidRead, { ...args, trust: 0 });
    assert.ok(Math.abs(r.probRead - P.probBid(4, 6, 12, hand, false)) < 1e-12);
  });
  it('первая ставка раунда или ставки на другую цифру: равны', () => {
    const base = P.probBid(4, 6, 12, hand, false);
    for (const bidHistory of [[], [{ playerId: 'b1', q: 2, f: 4 }]]) {
      const r = readInfo(P.probBidRead, { ...args, bidHistory });
      assert.ok(Math.abs(r.probRead - base) < 1e-12);
    }
  });
});

describe('readNote', () => {
  const pct = (x) => (x * 100).toFixed(1) + '%';
  it('два числа, если они различаются; пометка для смягчённого крестика', () => {
    const t = readNote({ prob: 0.096, probRead: 0.429, v: { code: 'meh', softened: true } }, pct);
    assert.match(t, /По вашим кубикам 9\.6%; с учётом ставок за столом 42\.9%/);
    assert.match(t, /соперники подтверждают цифру/);
    assert.doesNotMatch(readNote({ prob: 0.1, probRead: 0.2, v: { code: 'bad' } }, pct), /подтверждают/);
  });
  it('пусто: числа равны, старая запись без probRead, мусор', () => {
    assert.equal(readNote({ prob: 0.3, probRead: 0.3, v: {} }, pct), '');
    assert.equal(readNote({ prob: 0.3, v: { code: 'bad' } }, pct), '');
    assert.equal(readNote(null, pct), '');
    assert.equal(readNote({ prob: 0.3, probRead: NaN }, pct), '');
  });
});
