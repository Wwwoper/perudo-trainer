// src/table_read.js — «чтение стола» для «Разбора»: сколько кубиков у соперников и какие цифры они называли.
// Чистые функции без DOM; сама вероятность считается Perudo.probBidRead (core.js).
//
// Идея: соперник, который в этом раунде называл цифру, с большей вероятностью держит её на руках.
// Шанс нужной цифры на его кубике: p0 + TABLE_TRUST · (1 − p0), где p0 — обычный шанс (1/3, для единиц и в Палифико 1/6).

/** Доверие к ставкам за столом. Одна константа для «Разбора»; боты используют свои значения (bots.js). */
export const TABLE_TRUST = 0.2;

/**
 * Соперники для probBidRead: [{ k: число кубиков, faces: [цифры, названные им в этом раунде] }].
 * players — game.players (id, dice, alive); bidHistory — ставки текущего раунда ({ playerId, f }); meId — id человека.
 */
export function opponentsFromBids(players, bidHistory, meId) {
  const bids = Array.isArray(bidHistory) ? bidHistory : [];
  const out = [];
  for (const p of players || []) {
    if (!p || p.id === meId || !p.alive) continue;
    const k = Number.isInteger(p.dice) && p.dice > 0 ? p.dice : 0;
    if (!k) continue;
    const faces = [...new Set(bids.filter((b) => b && b.playerId === p.id).map((b) => b.f))];
    out.push({ k, faces });
  }
  return out;
}

/** Сколько ваших кубиков подходят к ставке на цифру face (в Палифико единицы — не джокеры). */
export function ownMatching(hand, face, wild) {
  return (hand || []).filter((d) => d === face || (wild && face !== 1 && d === 1)).length;
}

/**
 * Данные для записи «Разбора»: размер руки, сколько кубиков подходит, шанс с учётом стола.
 * probBidRead — Perudo.probBidRead; wild — единицы джокеры.
 */
export function readInfo(probBidRead, { q, f, hand, players, bidHistory, meId, wild, trust = TABLE_TRUST }) {
  const opps = opponentsFromBids(players, bidHistory, meId);
  return {
    handSize: (hand || []).length,
    ownMatch: ownMatching(hand, f, wild),
    probRead: probBidRead(q, f, hand, opps, wild, trust),
    trust,
  };
}

/**
 * HTML второго числа для строки «Разбора» (formatPct — pct из ui/common.js). Пусто, если записи старые (нет probRead)
 * или шанс с учётом стола не отличается от обычного (первая ставка раунда, ставок на эту цифру не было).
 */
export function readNote(e, formatPct) {
  if (!e || !Number.isFinite(e.probRead) || !Number.isFinite(e.prob) || Math.abs(e.probRead - e.prob) < 0.005) return '';
  const soft = e.v && e.v.softened ? ' Рискованно по вашим кубикам, но соперники подтверждают цифру.' : '';
  return `<div class="muted">По вашим кубикам ${formatPct(e.prob)}; с учётом ставок за столом ${formatPct(e.probRead)}.${soft}</div>`;
}
