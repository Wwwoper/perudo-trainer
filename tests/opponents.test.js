import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opponentProfiles, roundsOfGame, OBS_MIN } from '../src/opponents.js';

/**
 * Раунд 1: вы (место 0, [2,3,5]), bot_0 ([5,5,1]), bot_1 ([4,6,2]); wild.
 * Ставки: bot_1 1×4, вы 2×4, bot_0 3×5, bot_1 4×5; bot_0 'не верит' -> ставка 4×5 ложна? актуально: пятёрки 1+2+джокеры(1)=4
 */
const R1 = {
  id: 'g1-r1', ts: 1, round: 1, wild: true, me: 0, ids: ['human', 'bot_0', 'bot_1'],
  dice: [3, 3, 3], styles: [null, 'smart', 'bluffer'],
  hands: [[2, 3, 5], [5, 5, 1], [4, 6, 2]],
  bids: [{ s: 2, q: 1, f: 4 }, { s: 0, q: 2, f: 4 }, { s: 1, q: 3, f: 5 }, { s: 2, q: 4, f: 5 }],
  end: { kind: 'dudo', by: 1, bidder: 2, actual: 4, ok: true },
};
/** Раунд 2: нет bot_1 (выбит): вы [2,2], bot_0 [3,4]; bot_0 ставит 2×6, вы проверяете. Шестёрок и единиц нет. */
const R2 = {
  id: 'g1-r2', ts: 2, round: 2, wild: true, me: 0, ids: ['human', 'bot_0'],
  dice: [2, 2], styles: [null, 'smart'],
  hands: [[2, 2], [3, 4]],
  bids: [{ s: 1, q: 2, f: 6 }],
  end: { kind: 'dudo', by: 0, bidder: 1, actual: 0, ok: false },
};
const OLD = { ...R1, id: 'g0-r1', ids: undefined };

const prof = (res, id) => res.profiles.find((p) => p.id === id);

describe('opponentProfiles', () => {
  it('считает вскрытые ставки, проверки и прыжки', () => {
    const res = opponentProfiles([R1, R2]);
    assert.equal(res.rounds, 2);
    assert.equal(res.skipped, 0);
    assert.deepEqual(res.profiles.map((p) => p.id), ['bot_0', 'bot_1']);
    // bot_0: 3×5 с [5,5,1] — вся рука подходит; 2×6 с [3,4] — цифры нет
    const b0 = prof(res, 'bot_0');
    assert.equal(b0.seen, 2);
    assert.equal(b0.bids, 2);
    assert.deepEqual([b0.all, b0.part, b0.none], [1, 0, 1]);
    assert.equal(b0.raises, 1);            // 3×5 после 2×4: +1; 2×6 — первая ставка раунда
    assert.equal(b0.avgJump, 1);
    assert.equal(b0.dudos, 1);             // в раунде 1 проверял он
    assert.equal(b0.dudoHit, 0);           // ставка была верна (ok: true)
    assert.equal(b0.style, 'smart');
    // bot_1: 1×4 с [4,6,2] — часть; 4×5 с [4,6,2] — цифры нет (пятёрок и единиц нет)
    const b1 = prof(res, 'bot_1');
    assert.equal(b1.seen, 1);
    assert.deepEqual([b1.all, b1.part, b1.none], [0, 1, 1]);
    assert.equal(b1.raises, 1);
    assert.equal(b1.avgJump, 1);           // 4×5 после 3×5
    assert.equal(b1.style, 'bluffer');
  });
  it('проверка ложной ставки считается попаданием', () => {
    const wrong = { ...R1, id: 'g1-r3', bids: [...R1.bids.slice(0, 3), { s: 2, q: 5, f: 5 }], end: { kind: 'dudo', by: 1, bidder: 2, actual: 4, ok: false } };
    const res = opponentProfiles([wrong]);
    assert.equal(prof(res, 'bot_0').dudoHit, 1);
  });
  it('Calza считается отдельно', () => {
    const c = { ...R1, id: 'g1-r4', bids: [...R1.bids.slice(0, 3), { s: 2, q: 4, f: 5 }], end: { kind: 'calza', by: 1, bidder: 2, actual: 4, ok: true } };
    const b0 = prof(opponentProfiles([c]), 'bot_0');
    assert.equal(b0.calzas, 1);
    assert.equal(b0.dudos, 0);
  });
  it('порог «достаточно данных»: OBS_MIN вскрытых ставок', () => {
    assert.equal(OBS_MIN, 5);
    const rs = Array.from({ length: 5 }, (_, i) => ({ ...R2, id: `g1-r${10 + i}` }));
    assert.equal(prof(opponentProfiles(rs.slice(0, 4)), 'bot_0').enough, false);
    assert.equal(prof(opponentProfiles(rs), 'bot_0').enough, true);
  });
  it('раунды без ids и без вас за столом пропускаются, но считаются', () => {
    const res = opponentProfiles([OLD, R2, { ...R2, id: 'g1-r5', me: -1 }]);
    assert.equal(res.rounds, 1);
    assert.equal(res.skipped, 2);
    assert.deepEqual(res.profiles.map((p) => p.id), ['bot_0']);
  });
  it('мусор на входе не ломает', () => {
    for (const bad of [null, undefined, 5, 'x', {}, [null, 3, 'a', {}, { ids: ['a'] }]]) {
      assert.deepEqual(opponentProfiles(bad), { profiles: [], rounds: 0, skipped: 0 });
    }
  });
  it('Палифико: единицы не считаются подходящими', () => {
    // без джокеров на столе три пятёрки (у вас одна, у bot_0 две), ставка 4×5 ложна
    const bad = { ...R1, id: 'g1-r6', wild: false, end: { kind: 'dudo', by: 1, bidder: 2, actual: 3, ok: false } };
    const b0 = prof(opponentProfiles([bad]), 'bot_0');
    assert.deepEqual([b0.all, b0.part, b0.none], [0, 1, 0]);
  });
  it('только вскрытые раунды: в профиль идут лишь записи раундов (в них нет невскрытых ставок)', () => {
    // у раунда обязательно есть итог вскрытия; запись без него отбрасывается проверкой
    const noEnd = { ...R1, id: 'g1-r7', end: undefined };
    assert.equal(opponentProfiles([noEnd]).rounds, 0);
  });
  it('входные раунды не меняются', () => {
    const src = JSON.parse(JSON.stringify([R1, R2]));
    opponentProfiles(src);
    assert.deepEqual(src, JSON.parse(JSON.stringify([R1, R2])));
  });
});

describe('roundsOfGame', () => {
  it('раунды одной партии по префиксу id', () => {
    const rs = [R1, R2, { ...R1, id: 'g10-r1' }, OLD];
    assert.deepEqual(roundsOfGame(rs, 'g1').map((r) => r.id), ['g1-r1', 'g1-r2']);
    assert.deepEqual(roundsOfGame(rs, 'nope'), []);
    assert.deepEqual(roundsOfGame(null, 'g1'), []);
    assert.deepEqual(roundsOfGame([null, {}, { id: 5 }], 'g1'), []);
  });
});
