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

// ----- Разбор вскрытия: «Кто что называл» и «Решение и результат» -----
// Работают по записанному раунду (rounds.js): после вскрытия все руки известны, так что это факты, а не догадки.

/** Подпись под списком «Кто что называл»: что показано и чего это не доказывает. */
export const SAID_NOTE = 'Показано, сколько нужных кубиков было в руке автора ставки. Если их там не было, это ещё не блеф: ставка могла опираться на кубики других игроков. Единицы-джокеры учтены.';

/**
 * Что называл каждый игрок и сколько нужных кубиков было в его руке.
 * kind: 'none' — в руке нет нужной цифры, 'part' — часть кубиков, 'all' — вся рука подходит.
 * @param {object} round раунд из rounds.js (sanitizeRound)
 * @param {string[]} names имена по местам раунда
 * @returns {{items: object[], wild: boolean}|null}
 */
export function buildSaid(round, names = []) {
  if (!round || !Array.isArray(round.bids) || !Array.isArray(round.hands)) return null;
  const items = round.bids.map((b, i) => {
    const hand = round.hands[b.s] || [];
    const matches = hand.filter((d) => dieMatches(d, b.f, round.wild)).length;
    const size = hand.length;
    return {
      n: i + 1, seat: b.s, name: String(names[b.s] ?? ''), isMe: b.s === round.me,
      q: b.q, f: b.f, matches, size,
      kind: matches === 0 ? 'none' : matches === size ? 'all' : 'part',
    };
  });
  return items.length ? { items, wild: round.wild } : null;
}

/** Текст одной строки: «4×3 — в руке 2 из 3». */
export function saidText(item) {
  return `${item.q}×${item.f} — ${item.matches === 0 ? 'в руке нет этой цифры' : `в руке ${item.matches} из ${item.size}`}`;
}

/**
 * «Решение и результат»: шанс до вскрытия и что вышло, без путаницы между решением и исходом.
 * Берётся ваше последнее решение раунда; для повышения — только если проверили именно вашу ставку.
 * @param {{round: object, entry: {kind:string, prob:number, v:{code:string}}|null, lostMe: boolean}} s
 * @returns {string[]|null}
 */
export function buildDecision({ round, entry, lostMe }) {
  if (!round || !entry || !['raise', 'dudo', 'calza'].includes(entry.kind) || !Number.isFinite(entry.prob)) return null;
  if (entry.kind === 'raise' && round.end.bidder !== round.me) return null;
  const last = round.bids[round.bids.length - 1];
  const pct = `${Math.round(entry.prob * 100)} %`;
  const lines = [];
  if (entry.kind === 'dudo') {
    lines.push(`Вы проверили ставку: по расчёту она была верна с шансом ${pct}. На столе оказалось ${round.end.actual} из ${last.q} — ставка ${round.end.ok ? 'верна' : 'ложна'}.`);
  } else if (entry.kind === 'raise') {
    lines.push(`Ваша ставка ${last.q}×${last.f}: по расчёту верна с шансом ${pct}. На столе оказалось ${round.end.actual} — ставка ${round.end.ok ? 'верна' : 'ложна'}.`);
  } else {
    lines.push(`Calza на ${last.q}×${last.f}: шанс точного совпадения был ${pct}. На столе оказалось ${round.end.actual} — ${round.end.ok ? 'точно' : 'мимо'}.`);
  }
  const code = entry.v && entry.v.code;
  if (code === 'good' && lostMe) {
    lines.push('Решение было разумным по расчёту: потеря кубика здесь — результат случайности, а не ошибка.');
  } else if (code === 'bad' && !lostMe) {
    lines.push('Исход в вашу пользу, но шанс был невысоким: хороший результат не делает решение верным.');
  } else if (code === 'good' && !lostMe) {
    lines.push('Расчёт и результат совпали.');
  } else if (code === 'bad' && lostMe) {
    lines.push('Шанс был невысоким, и результат это подтвердил: такие решения стоит разбирать.');
  }
  return lines;
}
