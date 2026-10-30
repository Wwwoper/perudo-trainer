// situation.js — описание ситуации за столом для вашего хода: только факты и числа, без текста.
//
// Модуль чистый: ничего не знает ни о браузере, ни о движке. Вероятности считает функция probBid,
// которую передаёт вызывающий (в приложении это Perudo.probBid из core.js), как и в compare.js.
//
// Запрет скрытой информации: на входе нет чужих рук. Если в данных игроков есть поле hand/hands,
// модуль бросает ошибку, а не молча игнорирует его: утечка должна быть заметна сразу.
// Всё, что описано здесь, известно игроку и за настоящим столом: свои кубики, число кубиков у каждого,
// ставки раунда. Итог одного и того же входа всегда один и тот же.
//
// Результат describeSituation:
//   { phase: 'start'|'mid'|'endgame'|'palifico',
//     balance: { total, startTotal, myDice, players: [{ seat, id, dice, isMe, style }], leaders: [место], lastDice: [место],
//                next: место игрока, который ходит после вас },
//     facts: [ { kind: 'hand', counts: {1…6}, size }
//              | { kind: 'expectation', face, q, own, hidden, p, expected, need, gap }
//              | { kind: 'bid_trend', steps, jumps, faceChanges, last }
//              | { kind: 'table_read', p, pRead } ],
//     observations: { count, players: [{ seat, id, dice, bids, faces: {цифра: сколько раз}, last: {q, f}|null, silent }] },
//     options: [ вариант из compareOptions + { consequence: 'ends_round' | 'passes', passesTo?: место } ],
//     turnAfter: место следующего за вами живого игрока }
// Место — индекс в publicState.players (как в списке игры).

import { compareOptions } from './compare.js';
import { ENDGAME_TOTAL } from './moments.js';
import { TABLE_TRUST } from './table_read.js';

/** Начало партии: на столе не меньше этой доли кубиков от начального числа. */
export const START_SHARE = 0.8;

const isInt = Number.isInteger;
const isFace = (v) => isInt(v) && v >= 1 && v <= 6;
const isBid = (b) => b !== null && typeof b === 'object' && isInt(b.q) && b.q >= 1 && isFace(b.f);

function fail(Err, msg) { throw new Err(`describeSituation: ${msg}`); }

/** Проверка входа; бросает ошибку при чужих руках, несогласованных кубиках и мусоре. */
function validate({ publicState, myHand, bidLog, meSeat, probBid }) {
  if (typeof probBid !== 'function') fail(TypeError, 'нужна функция probBid');
  if (!publicState || typeof publicState !== 'object') fail(TypeError, 'нужен publicState');
  if ('hands' in publicState || 'hand' in publicState) fail(TypeError, 'в publicState не должно быть чужих рук');
  const { players } = publicState;
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) fail(RangeError, 'за столом от 2 до 6 игроков');
  for (const p of players) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string') fail(TypeError, 'игрок без id');
    if ('hand' in p || 'hands' in p) fail(TypeError, 'в данных игроков не должно быть рук');
    if (!isInt(p.dice) || p.dice < 0 || p.dice > 10) fail(RangeError, 'число кубиков игрока');
  }
  if (!isInt(meSeat) || meSeat < 0 || meSeat >= players.length) fail(RangeError, 'meSeat вне стола');
  const me = players[meSeat];
  if (me.alive === false || me.dice < 1) fail(RangeError, 'вы уже выбыли');
  if (!Array.isArray(myHand) || !myHand.every(isFace) || myHand.length !== me.dice) fail(RangeError, 'рука не сходится с числом кубиков');
  if (new Set(players.map((p) => p.id)).size !== players.length) fail(RangeError, 'повтор id игроков');
  if (!Array.isArray(bidLog)) fail(TypeError, 'нужен bidLog');
  const ids = new Set(players.map((p) => p.id));
  for (const b of bidLog) {
    if (!isBid(b) || !ids.has(b.playerId)) fail(TypeError, 'ставка в bidLog непригодна');
  }
  const bid = publicState.bid ?? null;
  if (bid !== null) {
    if (!isBid(bid)) fail(TypeError, 'ставка непригодна');
    const last = bidLog[bidLog.length - 1];
    if (!last || last.q !== bid.q || last.f !== bid.f || last.playerId !== bid.playerId) fail(RangeError, 'bidLog не сходится с текущей ставкой');
  } else if (bidLog.length) {
    fail(RangeError, 'ставки есть, а текущей ставки нет');
  }
}

/** Следующий живой игрок после места seat (по кругу). */
function nextAlive(players, seat) {
  for (let i = 1; i <= players.length; i++) {
    const s = (seat + i) % players.length;
    if (players[s].alive !== false && players[s].dice > 0) return s;
  }
  return seat;
}

function phaseOf(total, startTotal, wild) {
  if (!wild) return 'palifico';
  if (total <= ENDGAME_TOTAL) return 'endgame';
  if (total >= START_SHARE * startTotal) return 'start';
  return 'mid';
}

/**
 * @param {object} s
 * @param {{players: {id:string, dice:number, alive?:boolean, style?:string}[], bid?: ({playerId:string,q:number,f:number}|null), palifico?: boolean}} s.publicState
 * @param {number[]} s.myHand ваши кубики
 * @param {{playerId:string,q:number,f:number}[]} s.bidLog ставки текущего раунда по порядку
 * @param {number} s.meSeat ваше место в publicState.players
 * @param {{startDice?: number}} [s.rules]
 * @param {{hideStyles?: boolean, threshold?: number}} [s.settings] hideStyles по умолчанию включено
 * @param {Function} s.probBid (q, face, total, hand, wild) → вероятность
 * @param {Function} [s.probBidRead] (q, face, hand, opps, wild, trust) → вероятность с учётом ставок стола
 */
export function describeSituation(s) {
  validate(s);
  const { publicState, myHand, bidLog, meSeat, probBid } = s;
  const settings = s.settings || {};
  const hideStyles = settings.hideStyles !== false;
  const players = publicState.players;
  const wild = publicState.palifico !== true;
  const bid = publicState.bid ?? null;
  const meId = players[meSeat].id;

  const alive = players.map((p, seat) => ({ p, seat })).filter(({ p }) => p.alive !== false && p.dice > 0);
  const total = alive.reduce((a, { p }) => a + p.dice, 0);
  const startDice = isInt(s.rules?.startDice) && s.rules.startDice >= 1 ? s.rules.startDice : Math.max(...alive.map(({ p }) => p.dice));
  const startTotal = Math.max(total, startDice * players.length);
  const maxDice = Math.max(...alive.map(({ p }) => p.dice));
  const next = nextAlive(players, meSeat);

  const balance = {
    total, startTotal, myDice: myHand.length,
    players: alive.map(({ p, seat }) => ({
      seat, id: p.id, dice: p.dice, isMe: seat === meSeat,
      style: !hideStyles && seat !== meSeat && typeof p.style === 'string' ? p.style : null,
    })),
    leaders: alive.filter(({ p }) => p.dice === maxDice).map(({ seat }) => seat),
    lastDice: alive.filter(({ p }) => p.dice === 1).map(({ seat }) => seat),
    next,
  };

  const facts = [];
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const d of myHand) counts[d]++;
  facts.push({ kind: 'hand', counts, size: myHand.length });

  if (bid) {
    const f = bid.f;
    const own = myHand.filter((d) => d === f || (wild && f !== 1 && d === 1)).length;
    const hidden = total - myHand.length;
    const p = wild && f !== 1 ? 1 / 3 : 1 / 6;
    const expected = hidden * p;
    const need = Math.max(0, bid.q - own);
    facts.push({ kind: 'expectation', face: f, q: bid.q, own, hidden, p, expected, need, gap: need - expected });
    if (typeof s.probBidRead === 'function') {
      const opps = alive
        .filter(({ seat }) => seat !== meSeat)
        .map(({ p: pl }) => ({ k: pl.dice, faces: [...new Set(bidLog.filter((b) => b.playerId === pl.id).map((b) => b.f))] }));
      facts.push({
        kind: 'table_read', p: probBid(bid.q, f, total, myHand, wild),
        pRead: s.probBidRead(bid.q, f, myHand, opps, wild, TABLE_TRUST),
      });
    }
  }

  const steps = [];
  for (let i = 1; i < bidLog.length; i++) {
    steps.push({ dq: bidLog[i].q - bidLog[i - 1].q, faceChanged: bidLog[i].f !== bidLog[i - 1].f });
  }
  facts.push({
    kind: 'bid_trend', steps,
    jumps: steps.filter((st) => st.dq >= 2).length,
    faceChanges: steps.filter((st) => st.faceChanged).length,
    last: steps.length ? steps[steps.length - 1] : null,
  });

  const others = alive.filter(({ seat }) => seat !== meSeat).map(({ p, seat }) => {
    const mine = bidLog.filter((b) => b.playerId === p.id);
    const faces = {};
    for (const b of mine) faces[b.f] = (faces[b.f] || 0) + 1;
    const last = mine.length ? { q: mine[mine.length - 1].q, f: mine[mine.length - 1].f } : null;
    return { seat, id: p.id, dice: p.dice, bids: mine.length, faces, last, silent: mine.length === 0 };
  });
  const observations = { count: others.reduce((a, o) => a + o.bids, 0), players: others };

  let options = [];
  if (!bid || bid.playerId !== meId) {
    const cmp = compareOptions({
      bid: bid ? { q: bid.q, f: bid.f } : null, total, hand: myHand.slice(), wild,
      threshold: Number.isFinite(settings.threshold) ? settings.threshold : 0.5, probBid,
    });
    options = cmp.options.map((o) => (o.type === 'dudo'
      ? { ...o, consequence: 'ends_round' }
      : { ...o, consequence: 'passes', passesTo: next }));
  }

  return { phase: phaseOf(total, startTotal, wild), balance, facts, observations, options, turnAfter: next };
}
