import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReveal, dieMatches } from '../src/reveal.js';
import { createGame, startGame, applyAction } from '../src/engine.js';

const players = [
  { id: 'human', name: 'Вы', isBot: false },
  { id: 'bot_0', name: 'Иван', isBot: true },
  { id: 'bot_1', name: 'Мария', isBot: true },
];
const hands = [
  { playerId: 'human', hand: [5, 3, 2] },
  { playerId: 'bot_0', hand: [5, 5, 1] },
  { playerId: 'bot_1', hand: [6, 4, 2] },
];
const dudo = (o = {}) => ({
  type: 'DICE_REVEALED', kind: 'dudo', bid: { q: 3, f: 5, playerId: 'bot_0', playerName: 'Иван' },
  actualCount: 4, bidSuccessful: true, wild: true,
  challengerId: 'human', bidderId: 'bot_0', loserId: 'human', hands, ...o,
});

test('dieMatches: джокеры только при wild и не для единиц', () => {
  assert.equal(dieMatches(5, 5, true), true);
  assert.equal(dieMatches(1, 5, true), true);
  assert.equal(dieMatches(1, 5, false), false);
  assert.equal(dieMatches(1, 1, true), true);
  assert.equal(dieMatches(4, 5, true), false);
});

test('null: нет события, нет снимка рук, нет ставки', () => {
  assert.equal(buildReveal([], players), null);
  assert.equal(buildReveal(undefined, players), null);
  assert.equal(buildReveal([{ type: 'BID_PLACED' }], players), null);
  assert.equal(buildReveal([dudo({ hands: undefined })], players), null);
  assert.equal(buildReveal([dudo({ hands: [] })], players), null);
  assert.equal(buildReveal([dudo({ bid: undefined })], players), null);
});

test('dudo, ставка верна, человек теряет кубик', () => {
  const r = buildReveal([dudo(), { type: 'PLAYER_LOST_DIE', playerId: 'human', newDiceCount: 2 }], players);
  assert.equal(r.kind, 'dudo');
  assert.equal(r.headline, 'Вы: «Не верю!»');
  assert.equal(r.verdict, 'bid_true');
  assert.equal(r.verdictText, 'На столе 4 из 3 — ставка верна');
  assert.equal(r.outcomeText, 'Вы теряете кубик');
  assert.deepEqual(r.bid, { q: 3, f: 5, playerName: 'Иван' });
  assert.deepEqual(r.rows.map((x) => x.name), ['Вы', 'Иван', 'Мария']);
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 3, 0]);
  assert.deepEqual(r.rows[1].hand, [1, 5, 5]);               // отсортированы
  assert.deepEqual(r.rows.map((x) => x.isBidder), [false, true, false]);
  assert.deepEqual(r.rows.map((x) => x.isChallenger), [true, false, false]);
  assert.deepEqual(r.rows.map((x) => x.isLoser), [true, false, false]);
});

test('dudo, ставка ложна, бот выбывает', () => {
  const r = buildReveal([
    dudo({ bidSuccessful: false, actualCount: 2, loserId: 'bot_0', challengerId: 'bot_1' }),
    { type: 'PLAYER_LOST_DIE', playerId: 'bot_0', newDiceCount: 0 },
    { type: 'PLAYER_ELIMINATED', playerId: 'bot_0' },
  ], players);
  assert.equal(r.headline, 'Мария: «Не верю!»');
  assert.equal(r.verdictText, 'На столе 2 из 3 — ставка ложна');
  assert.equal(r.outcomeText, 'Иван выбывает');
  assert.deepEqual(r.eliminatedIds, ['bot_0']);
});

test('человек выбывает: «Вы выбываете»', () => {
  const r = buildReveal([
    dudo(),
    { type: 'PLAYER_LOST_DIE', playerId: 'human', newDiceCount: 0 },
    { type: 'PLAYER_ELIMINATED', playerId: 'human' },
  ], players);
  assert.equal(r.outcomeText, 'Вы выбываете');
});

test('палифико: единицы не считаются совпадением', () => {
  const r = buildReveal([dudo({ wild: false, actualCount: 3 })], players);
  assert.equal(r.wild, false);
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 2, 0]);
});

test('calza точна: получает кубик / уже максимум', () => {
  const calza = (o) => ({
    type: 'DICE_REVEALED', kind: 'calza', bid: { q: 4, f: 5, playerId: 'bot_0' }, actualCount: 4,
    calzaExact: true, wild: true, challengerId: 'human', bidderId: 'bot_0', hands, ...o,
  });
  const a = buildReveal([calza(), { type: 'PLAYER_GAINED_DIE', playerId: 'human', newDiceCount: 4 }], players);
  assert.equal(a.headline, 'Вы: «Calza!»');
  assert.equal(a.verdict, 'calza_exact');
  assert.equal(a.verdictText, 'На столе 4 при ставке 4 — точно!');
  assert.equal(a.outcomeText, 'Вы получаете кубик');
  assert.equal(a.rows.some((r) => r.isLoser), false);
  const b = buildReveal([calza()], players);
  assert.equal(b.outcomeText, 'Кубик не добавлен: уже максимум');
});

test('calza мимо: теряет кубик', () => {
  const r = buildReveal([
    { type: 'DICE_REVEALED', kind: 'calza', bid: { q: 5, f: 5, playerId: 'bot_0' }, actualCount: 4, calzaExact: false,
      wild: true, challengerId: 'bot_1', bidderId: 'bot_0', hands },
    { type: 'PLAYER_LOST_DIE', playerId: 'bot_1', newDiceCount: 2 },
  ], players);
  assert.equal(r.verdict, 'calza_miss');
  assert.equal(r.verdictText, 'На столе 4 при ставке 5 — мимо');
  assert.equal(r.outcomeText, 'Мария теряет кубик');
});

test('интеграция с движком: модель строится из настоящих событий', () => {
  const g = createGame({ botCount: 2, startDice: 3, botNames: ['Иван', 'Мария'] });
  startGame(g);
  g.players[0].hand = [2, 3, 5]; g.players[1].hand = [5, 5, 1]; g.players[2].hand = [4, 6, 2];
  g.currentPlayer = 0;
  g.bid = { playerId: 'bot_0', playerName: 'Иван', q: 3, f: 5 };
  const res = applyAction(g, 'human', { type: 'dudo' });
  const r = buildReveal(res.events, g.players);
  assert.equal(r.verdict, 'bid_true');
  assert.equal(r.actualCount, 4);
  assert.equal(r.outcomeText, 'Вы теряете кубик');
  assert.deepEqual(r.rows.map((x) => x.matches), [1, 3, 0]);
});

// ----- Разбор вскрытия: «Кто что называл» и «Решение и результат» -----
import { describe, it } from 'node:test';
import { buildSaid, saidText, buildDecision, SAID_NOTE } from '../src/reveal.js';
import { sanitizeRound } from '../src/rounds.js';

/** Раунд: вы — место 0 с [2,2,1], соперник — место 1 с [3,4]; ставки: 2×3 (он), 3×2 (вы), 3×3 (он); итог — «не верю» от вас. */
const roundFx = (extra = {}) => sanitizeRound({
  id: 'g-r1', ts: 1, round: 1, wild: true, me: 0, dice: [3, 2], styles: [null, 'smart'],
  hands: [[2, 2, 1], [3, 4]],
  bids: [{ s: 1, q: 2, f: 3 }, { s: 0, q: 3, f: 2 }, { s: 1, q: 3, f: 3 }],
  end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: false },
  ...extra,
});

describe('buildSaid', () => {
  it('для каждой ставки раунда: автор, ставка, сколько нужных кубиков в его руке', () => {
    const s = buildSaid(roundFx(), ['Вы', 'Мария']);
    assert.equal(s.items.length, 3);
    assert.deepEqual(s.items.map((i) => [i.n, i.name, i.isMe, i.q, i.f, i.matches, i.size, i.kind]), [
      [1, 'Мария', false, 2, 3, 1, 2, 'part'],        // тройка одна из двух кубиков
      [2, 'Вы', true, 3, 2, 3, 3, 'all'],             // две двойки и джокер — вся рука
      [3, 'Мария', false, 3, 3, 1, 2, 'part'],
    ]);
  });
  it('в руке нет цифры — kind none; Палифико: единицы не джокеры', () => {
    const r = roundFx({ bids: [{ s: 1, q: 1, f: 5 }, { s: 0, q: 1, f: 6 }, { s: 1, q: 1, f: 1 }, ], end: { kind: 'dudo', by: 0, bidder: 1, actual: 1, ok: true } });
    const s = buildSaid(r, ['Вы', 'Мария']);
    assert.deepEqual(s.items.map((i) => i.kind), ['none', 'part', 'none']);   // у вас единица-джокер подходит к шестёрке
    const pal = roundFx({ wild: false, bids: [{ s: 1, q: 1, f: 2 }, { s: 0, q: 2, f: 2 }], end: { kind: 'dudo', by: 1, bidder: 0, actual: 2, ok: true } });
    assert.equal(buildSaid(pal, ['Вы', 'М']).items[1].matches, 2);       // без джокера две двойки, а не три кубика
  });
  it('названия мест не заданы — пустая строка, не падает', () => {
    assert.equal(buildSaid(roundFx(), []).items[0].name, '');
  });
  it('мусор — null', () => {
    for (const bad of [null, undefined, {}, { bids: [] }, { bids: [{ s: 0, q: 1, f: 1 }] }]) assert.equal(buildSaid(bad, []), null);
    assert.equal(buildSaid({ bids: [], hands: [] }, []), null);
  });
  it('тексты строк; подпись не называет «блефом» отсутствие цифры', () => {
    const s = buildSaid(roundFx({ bids: [{ s: 1, q: 1, f: 5 }, { s: 0, q: 1, f: 2 }], end: { kind: 'dudo', by: 1, bidder: 0, actual: 3, ok: true } }), ['Вы', 'М']);
    assert.equal(saidText(s.items[0]), '1×5 — в руке нет этой цифры');
    assert.equal(saidText(s.items[1]), '1×2 — в руке 3 из 3');
    assert.match(SAID_NOTE, /ещё не блеф/);
    for (const it of s.items) assert.ok(!/блеф|обман/i.test(saidText(it)));
  });
});

describe('buildDecision', () => {
  const entry = (kind, prob, code) => ({ kind, prob, v: { code } });
  const text = (l) => l.join(' ');

  it('проверка: шанс, итог и различие решения и исхода', () => {
    const r = roundFx();   // ставка 3×3 ложна: на столе 2
    const good = buildDecision({ round: r, entry: entry('dudo', 0.35, 'good'), lostMe: false });
    assert.match(good[0], /по расчёту она была верна с шансом 35 %\. На столе оказалось 2 из 3 — ставка ложна/);
    assert.match(good[1], /Расчёт и результат совпали/);
  });
  it('верное решение, но кубик потерян — не ошибка', () => {
    const r = roundFx({ end: { kind: 'dudo', by: 0, bidder: 1, actual: 2, ok: false } });
    const l = buildDecision({ round: r, entry: entry('dudo', 0.4, 'good'), lostMe: true });
    assert.match(l[1], /результат случайности, а не ошибка/);
  });
  it('слабое решение, но повезло — хороший результат не делает решение верным', () => {
    const l = buildDecision({ round: roundFx(), entry: entry('dudo', 0.8, 'bad'), lostMe: false });
    assert.match(l[1], /не делает решение верным/);
  });
  it('слабое решение и плохой результат', () => {
    const l = buildDecision({ round: roundFx(), entry: entry('dudo', 0.8, 'bad'), lostMe: true });
    assert.match(l[1], /такие решения стоит разбирать/);
  });
  it('«спорно» без дополнительной строки', () => {
    assert.equal(buildDecision({ round: roundFx(), entry: entry('dudo', 0.5, 'meh'), lostMe: false }).length, 1);
  });
  it('ваша ставка, которую проверили', () => {
    const r = roundFx({ bids: [{ s: 1, q: 2, f: 3 }, { s: 0, q: 3, f: 2 }], end: { kind: 'dudo', by: 1, bidder: 0, actual: 3, ok: true } });
    const l = buildDecision({ round: r, entry: entry('raise', 0.7, 'good'), lostMe: false });
    assert.match(l[0], /Ваша ставка 3×2: по расчёту верна с шансом 70 %\. На столе оказалось 3 — ставка верна/);
  });
  it('ваша ставка, но проверили чужую — сводки нет', () => {
    assert.equal(buildDecision({ round: roundFx(), entry: entry('raise', 0.7, 'good'), lostMe: false }), null);
  });
  it('Calza: точно и мимо', () => {
    const miss = roundFx({ bids: [{ s: 1, q: 1, f: 3 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 2, ok: false } });
    assert.match(buildDecision({ round: miss, entry: entry('calza', 0.3, 'bad'), lostMe: true })[0], /На столе оказалось 2 — мимо/);
    const hit = roundFx({ bids: [{ s: 1, q: 2, f: 3 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 2, ok: true } });
    const l = buildDecision({ round: hit, entry: entry('calza', 0.2, 'good'), lostMe: false });
    assert.match(l[0], /Calza на 2×3: шанс точного совпадения был 20 %\. На столе оказалось 2 — точно/);
  });
  it('нет данных — null', () => {
    assert.equal(buildDecision({ round: null, entry: entry('dudo', 0.5, 'good'), lostMe: false }), null);
    assert.equal(buildDecision({ round: roundFx(), entry: null, lostMe: false }), null);
    assert.equal(buildDecision({ round: roundFx(), entry: entry('шаг', 0.5, 'good'), lostMe: false }), null);
    assert.equal(buildDecision({ round: roundFx(), entry: entry('dudo', NaN, 'good'), lostMe: false }), null);
  });
  it('в текстах нет слов «обманщик», «врёт», «лжец»', () => {
    for (const code of ['good', 'meh', 'bad']) for (const lost of [true, false]) {
      const l = buildDecision({ round: roundFx(), entry: entry('dudo', 0.5, code), lostMe: lost });
      assert.ok(!/обманщик|врёт|лжец|обман/i.test(text(l)));
    }
  });
});
