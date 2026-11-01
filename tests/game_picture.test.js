import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gameRounds, roundLoser, diceByRound, pictureLines } from '../src/game_picture.js';
import { BANNED } from '../src/situation_text.js';

/** Три раунда, вы (human) и bot_0; последняя ставка в каждом раунде проверена. */
const R = (n, dice, hands, bids, end, extra = {}) => ({
  id: `g1-r${n}`, ts: n, round: n, wild: true, me: 0, ids: ['human', 'bot_0'], styles: [null, 'smart'],
  dice, hands, bids, end, ...extra,
});
// раунд 1: 3 и 3 кубика; ставка bot_0 2×4 верна (у bot_0 [4,4,2], у вас [2,3,5]: четвёрок 2), вы проверяли: теряете кубик
const R1 = R(1, [3, 3], [[2, 3, 5], [4, 4, 2]], [{ s: 1, q: 2, f: 4 }], { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: true });
// раунд 2: 2 и 3; ваша ставка 2×6 ложна (шестёрок нет), bot_0 проверил: теряете кубик
const R2 = R(2, [2, 3], [[2, 3], [4, 4, 2]], [{ s: 0, q: 2, f: 6 }], { kind: 'dudo', by: 1, bidder: 0, actual: 0, ok: false });
// раунд 3: 1 и 3; bot_0 ставит 3×4 (у него две четвёрки, у вас шестёрка): ложна; вы проверили — bot_0 теряет
const R3 = R(3, [1, 3], [[6], [4, 4, 2]], [{ s: 1, q: 3, f: 4 }], { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: false });
const ALL = [R3, R1, R2];

describe('gameRounds', () => {
  it('раунды партии по порядку; чужие партии и раунды без ids отбрасываются', () => {
    const old = { ...R1, id: 'g1-r9', ids: undefined };
    const other = { ...R1, id: 'g2-r1' };
    assert.deepEqual(gameRounds([...ALL, old, other, null, 5], 'g1').map((r) => r.round), [1, 2, 3]);
    assert.deepEqual(gameRounds(null, 'g1'), []);
    assert.deepEqual(gameRounds(ALL, 'x'), []);
  });
});

describe('roundLoser', () => {
  it('проверка: верная ставка — теряет проверявший, ложная — автор', () => {
    assert.equal(roundLoser(R1), 0);
    assert.equal(roundLoser(R2), 0);
    assert.equal(roundLoser(R3), 1);
  });
  it('Calza: точная — никто, мимо — тот, кто сказал', () => {
    assert.equal(roundLoser({ end: { kind: 'calza', ok: true, by: 0, bidder: 1 } }), -1);
    assert.equal(roundLoser({ end: { kind: 'calza', ok: false, by: 0, bidder: 1 } }), 0);
  });
});

describe('diceByRound', () => {
  it('кубики на начало каждого раунда и итоговая точка', () => {
    const rs = gameRounds(ALL, 'g1');
    const c = diceByRound(rs, { human: 0, bot_0: 3 });
    assert.deepEqual(c.labels, ['1', '2', '3', 'итог']);
    assert.deepEqual(c.series.map((s) => [s.id, s.isMe, s.values]), [['human', true, [3, 2, 1, 0]], ['bot_0', false, [3, 3, 3, 3]]]);
    assert.equal(c.max, 3);
  });
  it('без итоговой точки; без раундов — null', () => {
    assert.deepEqual(diceByRound(gameRounds(ALL, 'g1')).labels, ['1', '2', '3']);
    assert.equal(diceByRound([]), null);
    assert.equal(diceByRound(null), null);
  });
  it('выбитый игрок получает нули', () => {
    const solo = { ...R3, id: 'g1-r4', round: 4, ids: ['human', 'bot_1'], dice: [1, 3] };
    const c = diceByRound(gameRounds([R1, solo], 'g1'));
    assert.deepEqual(c.series.find((s) => s.id === 'bot_0').values, [3, 0]);
    assert.deepEqual(c.series.find((s) => s.id === 'bot_1').values, [0, 3]);
  });
});

describe('pictureLines', () => {
  const rs = gameRounds(ALL, 'g1');
  const names = { human: 'Вы', bot_0: 'Алексей' };
  it('потери, переломный раунд с шансом из «Разбора», лидер', () => {
    const lines = pictureLines({ rounds: rs, finalDice: { human: 0, bot_0: 3 }, names, entryFor: (n) => (n === 2 ? { kind: 'raise', prob: 0.22 } : null) });
    const byId = Object.fromEntries(lines.map((l) => [l.id, l.text]));
    assert.match(byId.losses, /Вскрытий в партии: 3\. Кубик вы потеряли в 2 из них\./);
    assert.match(byId.turning, /раунд 2: вы потеряли кубик, поставив со своим шансом 22 %/);
    assert.match(byId.turning, /упала с 40 % до 25 %/);
    assert.match(byId.leader, /у игрока Алексей: в 2 из 3 раундов/);
  });
  it('проверка: шанс чужой ставки из разбора', () => {
    const t = pictureLines({ rounds: rs, names, entryFor: () => ({ kind: 'dudo', prob: 0.31 }) }).find((l) => l.id === 'turning').text;
    assert.match(t, /проверив ставку, которая по расчёту была верна с шансом 31 %/);
  });
  it('без записи разбора переломный раунд описан без шанса', () => {
    const t = pictureLines({ rounds: rs, names }).find((l) => l.id === 'turning').text;
    assert.ok(!/шансом/.test(t));
  });
  it('вы не теряли кубик: факт без переломного раунда', () => {
    const win = { ...R3, id: 'g1-r1', round: 1 };
    const lines = pictureLines({ rounds: gameRounds([win], 'g1'), names });
    assert.match(lines[0].text, /не потеряли ни разу/);
    assert.ok(!lines.some((l) => l.id === 'turning'));
  });
  it('нет раундов — пусто', () => {
    assert.deepEqual(pictureLines({ rounds: [] }), []);
    assert.deepEqual(pictureLines({}), []);
  });
  it('тексты без запрещённых формулировок и служебных значений', () => {
    const t = pictureLines({ rounds: rs, finalDice: { human: 0, bot_0: 3 }, names, entryFor: () => ({ kind: 'raise', prob: 0.3 }) })
      .map((l) => l.text).join(' ');
    for (const re of BANNED) assert.ok(!re.test(t), `${re}: ${t}`);
    assert.ok(!/undefined|NaN|null|обманщик|врёт|блеф/i.test(t), t);
  });
});
