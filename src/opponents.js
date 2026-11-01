// opponents.js — наблюдаемый профиль соперников: что видно по вскрытым раундам партии.
//
// Чистый модуль: без DOM и хранилища. Источник — только раунды, закончившиеся вскрытием (rounds.js): до вскрытия
// чужие руки неизвестны, поэтому в профиль не попадает ни одна ставка из невскрытого раунда.
// Раунды без ids (записаны старой версией) пропускаются: без id соперника не узнать между раундами.
//
// Профиль — наблюдения, а не оценка игрока: «у автора в руке не было нужной цифры» не означает блеф,
// ставка могла опираться на кубики других игроков.

import { sanitizeRound } from './rounds.js';
import { dieMatches } from './reveal.js';

/** Сколько вскрытых ставок соперника нужно, чтобы показывать доли (меньше — только счётчики). */
export const OBS_MIN = 5;

/**
 * Профили соперников по раундам.
 * @param {object[]} rounds раунды из хранилища (мусор отбрасывается)
 * @returns {{profiles: object[], rounds: number, skipped: number}}
 *   profiles: [{ id, style|null, seen (раундов за столом), bids, all, part, none, raises, avgJump|null,
 *                dudos, dudoHit, calzas, enough }] в порядке первого появления;
 *   rounds — сколько раундов учтено, skipped — сколько пропущено (нет ids или нет вас за столом)
 */
export function opponentProfiles(rounds) {
  const byId = new Map();
  let used = 0;
  let skipped = 0;
  for (const raw of Array.isArray(rounds) ? rounds : []) {
    const r = sanitizeRound(raw);
    if (!r) continue;
    if (!r.ids || r.me < 0) { skipped++; continue; }
    used++;
    const get = (seat) => {
      const id = r.ids[seat];
      if (!byId.has(id)) {
        byId.set(id, { id, style: null, seen: 0, bids: 0, all: 0, part: 0, none: 0, raises: 0, jumpSum: 0, dudos: 0, dudoHit: 0, calzas: 0 });
      }
      return byId.get(id);
    };
    r.ids.forEach((_, seat) => {
      if (seat === r.me) return;
      const p = get(seat);
      p.seen++;
      if (r.styles[seat]) p.style = r.styles[seat];
    });
    r.bids.forEach((b, i) => {
      if (b.s === r.me) return;
      const p = get(b.s);
      const hand = r.hands[b.s];
      const have = hand.filter((d) => dieMatches(d, b.f, r.wild)).length;
      p.bids++;
      if (have === 0) p.none++; else if (have === hand.length) p.all++; else p.part++;
      if (i > 0) { p.raises++; p.jumpSum += b.q - r.bids[i - 1].q; }
    });
    if (r.end.by !== r.me) {
      const p = get(r.end.by);
      if (r.end.kind === 'dudo') { p.dudos++; if (!r.end.ok) p.dudoHit++; } else p.calzas++;
    }
  }
  const profiles = [...byId.values()].map(({ jumpSum, ...p }) => ({
    ...p, avgJump: p.raises ? jumpSum / p.raises : null, enough: p.bids >= OBS_MIN,
  }));
  return { profiles, rounds: used, skipped };
}

/** Раунды одной партии: id раунда имеет вид «партия-rN». */
export function roundsOfGame(rounds, gameId) {
  const prefix = `${String(gameId ?? '')}-r`;
  return (Array.isArray(rounds) ? rounds : []).filter((r) => typeof r?.id === 'string' && r.id.startsWith(prefix));
}
