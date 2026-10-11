// reveal.js — модель «вскрытия» после «Не верю» / Calza (чистые функции, без DOM).
//
// Вход — события одного действия из engine.js (res.events) и список игроков.
// Движок сразу после проверки раздаёт новые кубики, поэтому руки берутся из
// снимка в событии DICE_REVEALED (поле hands), а не из состояния игры.

/** Считается ли кубик d попавшим в ставку на грань face. */
export function dieMatches(d, face, wild) {
  return d === face || (!!wild && d === 1 && face !== 1);
}

const QUOTE = (s) => `«${s}»`;

/**
 * @param {object[]} events   события действия (res.events)
 * @param {object[]} players  game.players (имена и признак человека)
 * @returns {null | object}   null, если вскрытия в событиях нет или нет снимка рук
 */
export function buildReveal(events, players) {
  const ev = (events || []).find((e) => e.type === 'DICE_REVEALED');
  if (!ev || !Array.isArray(ev.hands) || !ev.hands.length || !ev.bid) return null;

  const byId = new Map((players || []).map((p) => [p.id, p]));
  const isHuman = (p) => !!p && (p.isHuman === true || p.isBot === false);
  const nameOf = (id) => {
    const p = byId.get(id);
    return p ? (isHuman(p) ? 'Вы' : String(p.name ?? '')) : '';
  };
  // «Вы теряете» / «Иван теряет»
  const verb = (id, you, he) => (isHuman(byId.get(id)) ? you : he);

  const kind = ev.kind === 'calza' ? 'calza' : 'dudo';
  const wild = ev.wild !== false;
  const { q, f } = ev.bid;

  const rows = ev.hands.map((h) => {
    const hand = h.hand.slice().sort((a, b) => a - b);
    return {
      id: h.playerId,
      name: nameOf(h.playerId),
      isHuman: isHuman(byId.get(h.playerId)),
      hand,
      matches: hand.filter((d) => dieMatches(d, f, wild)).length,
      isBidder: h.playerId === ev.bidderId,
      isChallenger: h.playerId === ev.challengerId,
      isLoser: kind === 'dudo' && h.playerId === ev.loserId,
    };
  });

  const lost = (events || []).find((e) => e.type === 'PLAYER_LOST_DIE');
  const gained = (events || []).find((e) => e.type === 'PLAYER_GAINED_DIE');
  const eliminated = (events || []).filter((e) => e.type === 'PLAYER_ELIMINATED').map((e) => e.playerId);

  let verdict;
  let verdictText;
  let outcomeText = '';

  if (kind === 'dudo') {
    verdict = ev.bidSuccessful ? 'bid_true' : 'bid_false';
    verdictText = `На столе ${ev.actualCount} из ${q} — ставка ${ev.bidSuccessful ? 'верна' : 'ложна'}`;
  } else {
    verdict = ev.calzaExact ? 'calza_exact' : 'calza_miss';
    verdictText = `На столе ${ev.actualCount} при ставке ${q} — ${ev.calzaExact ? 'точно!' : 'мимо'}`;
  }

  if (gained) {
    outcomeText = `${nameOf(gained.playerId)} ${verb(gained.playerId, 'получаете', 'получает')} кубик`;
  } else if (lost) {
    const id = lost.playerId;
    outcomeText = eliminated.includes(id)
      ? `${nameOf(id)} ${verb(id, 'выбываете', 'выбывает')}`
      : `${nameOf(id)} ${verb(id, 'теряете', 'теряет')} кубик`;
  } else if (kind === 'calza' && ev.calzaExact) {
    outcomeText = 'Кубик не добавлен: уже максимум';
  }

  return {
    kind,
    wild,
    bid: { q, f, playerName: nameOf(ev.bidderId) || String(ev.bid.playerName ?? '') },
    actualCount: ev.actualCount,
    headline: `${nameOf(ev.challengerId)}: ${QUOTE(kind === 'dudo' ? 'Не верю!' : 'Calza!')}`,
    verdict,
    verdictText,
    outcomeText,
    rows,
    eliminatedIds: eliminated,
  };
}
