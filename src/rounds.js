// rounds.js — завершённые раунды партии: модель, сборка из событий движка, безопасное чтение.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage, ни об интерфейсе.
// Хранилище читает и пишет storage.js (ключ perudo.rounds), запись ведёт ui/rounds_log.js.
//
// Раунд — всё, что стало известно за столом после вскрытия (чужие кубики до вскрытия не хранятся и не известны):
//   { id, ts, round, wild: единицы — джокеры?,
//     me: ваше место среди игроков раунда (0…) или -1, если вас за столом нет,
//     dice: кубики каждого игрока в начале раунда по местам,
//     styles: стили по местам (null у вас и у тех, чей стиль неизвестен),
//     hands: кубики каждого игрока при вскрытии по местам,
//     bids: ставки раунда по порядку { s: место автора, q, f },
//     end: { kind: 'dudo'|'calza', by: кто проверил, bidder: автор последней ставки,
//            actual: сколько нужных кубиков было на столе, ok: ставка верна (dudo) / точно (calza) } }

export const ROUND_KINDS = ['dudo', 'calza'];
/** Сколько раундов хранится всего (старые вытесняются первыми). */
export const MAX_ROUNDS = 40;
/** Сколько ставок одного раунда хранится (защита от мусора; в игре их заметно меньше). */
export const MAX_ROUND_BIDS = 60;

const MAX_PLAYERS = 6;
const MAX_HAND = 10;
const MAX_DICE = 100;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isFace = (v) => isInt(v) && v >= 1 && v <= 6;

/**
 * Сколько кубиков нужной грани на столе (единицы-джокеры считаются, если wild и грань не 1).
 * @param {number[][]} hands руки всех игроков
 */
export function countFace(hands, face, wild) {
  let n = 0;
  for (const h of hands) for (const d of h) if (d === face || (wild && d === 1 && face !== 1)) n++;
  return n;
}

/**
 * Снимок раунда перед проверкой или Calza: пока движок не начал следующий раунд и не стёр ставки.
 * @param {{round:number, palifico:boolean, players:{id:string,dice:number,alive:boolean,style?:string}[],
 *          bidHistory:{playerId:string,q:number,f:number}[]}} g состояние игры
 */
export function snapshotRound(g) {
  const seats = (Array.isArray(g?.players) ? g.players : [])
    .filter((p) => p && p.alive !== false)
    .map((p) => ({ id: p.id, dice: p.dice, style: typeof p.style === 'string' ? p.style : null }));
  const bids = (Array.isArray(g?.bidHistory) ? g.bidHistory : [])
    .filter((b) => b && typeof b.playerId === 'string')
    .map((b) => ({ playerId: b.playerId, q: b.q, f: b.f }));
  return { round: g?.round, wild: !g?.palifico, seats, bids };
}

/**
 * Собирает раунд из снимка и события DICE_REVEALED.
 * @returns {object|null} чистый раунд или null, если данные непригодны
 */
export function buildRound({ id, ts, snap, reveal, meId = 'human' }) {
  if (!snap || !Array.isArray(snap.seats) || !isObject(reveal) || !Array.isArray(reveal.hands)) return null;
  const seatOf = new Map(snap.seats.map((p, i) => [p.id, i]));
  const handsById = new Map(reveal.hands.map((h) => [h?.playerId, h?.hand]));
  const hands = snap.seats.map((p) => handsById.get(p.id));
  const me = seatOf.has(meId) ? seatOf.get(meId) : -1;
  const bids = snap.bids.filter((b) => seatOf.has(b.playerId)).map((b) => ({ s: seatOf.get(b.playerId), q: b.q, f: b.f }));
  const by = seatOf.get(reveal.challengerId);
  const bidder = seatOf.get(reveal.bidderId);
  const kind = reveal.kind;
  return sanitizeRound({
    id, ts, round: snap.round, wild: snap.wild,
    me,
    dice: snap.seats.map((p) => p.dice),
    styles: snap.seats.map((p) => p.style),
    hands,
    bids,
    end: {
      kind, by, bidder, actual: reveal.actualCount,
      ok: kind === 'calza' ? reveal.calzaExact === true : reveal.bidSuccessful === true,
    },
  });
}

/**
 * Проверяет и очищает раунд (из хранилища, из файла копии). Лишние поля отбрасываются.
 * Раунд, где данные противоречат друг другу (рука не по числу кубиков, итог не сходится с ставкой), отбрасывается целиком:
 * текст пояснения не должен опираться на выдуманный раунд.
 * @returns {object|null}
 */
export function sanitizeRound(raw) {
  if (!isObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : (isInt(raw.id) ? String(raw.id) : '');
  if (!id || id.length > 64) return null;
  if (typeof raw.ts !== 'number' || !Number.isFinite(raw.ts)) return null;
  if (!isInt(raw.round) || raw.round < 0) return null;
  if (typeof raw.wild !== 'boolean') return null;

  const { dice, hands, styles, bids, end } = raw;
  if (!Array.isArray(dice) || dice.length < 2 || dice.length > MAX_PLAYERS) return null;
  if (!dice.every((d) => isInt(d) && d >= 1 && d <= MAX_HAND)) return null;
  const n = dice.length;
  if (!isInt(raw.me) || raw.me < -1 || raw.me >= n) return null;
  if (!Array.isArray(hands) || hands.length !== n) return null;
  for (let i = 0; i < n; i++) {
    const h = hands[i];
    if (!Array.isArray(h) || h.length !== dice[i] || !h.every(isFace)) return null;
  }
  if (!Array.isArray(styles) || styles.length !== n) return null;
  const cleanStyles = styles.map((s, i) => (i !== raw.me && typeof s === 'string' && /^[a-z]{1,20}$/.test(s) ? s : null));

  if (!Array.isArray(bids) || bids.length < 1 || bids.length > MAX_ROUND_BIDS) return null;
  const cleanBids = [];
  for (const b of bids) {
    if (!isObject(b) || !isInt(b.s) || b.s < 0 || b.s >= n) return null;
    if (!isInt(b.q) || b.q < 1 || b.q > MAX_DICE || !isFace(b.f)) return null;
    cleanBids.push({ s: b.s, q: b.q, f: b.f });
  }
  const last = cleanBids[cleanBids.length - 1];

  if (!isObject(end) || !ROUND_KINDS.includes(end.kind)) return null;
  if (!isInt(end.by) || end.by < 0 || end.by >= n || end.by === last.s) return null;
  if (end.bidder !== last.s) return null;
  const total = dice.reduce((a, b) => a + b, 0);
  if (!isInt(end.actual) || end.actual < 0 || end.actual > total) return null;
  if (typeof end.ok !== 'boolean') return null;
  if (countFace(hands, last.f, raw.wild) !== end.actual) return null;
  if (end.ok !== (end.kind === 'calza' ? end.actual === last.q : end.actual >= last.q)) return null;

  return {
    id, ts: raw.ts, round: raw.round, wild: raw.wild, me: raw.me,
    dice: dice.slice(), styles: cleanStyles, hands: hands.map((h) => h.slice()), bids: cleanBids,
    end: { kind: end.kind, by: end.by, bidder: end.bidder, actual: end.actual, ok: end.ok },
  };
}

/**
 * Безопасное чтение списка раундов: мусор отбрасывается, повторы по id схлопываются
 * (остаётся последняя запись), хранится не больше limit самых новых.
 */
export function normalizeRounds(raw, limit = MAX_ROUNDS) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const item of raw) {
    const r = sanitizeRound(item);
    if (!r) continue;
    byId.delete(r.id);              // повтор уходит в конец, как более новый
    byId.set(r.id, r);
  }
  return [...byId.values()].slice(-limit);
}

/** Добавляет новые раунды к сохранённым с учётом лимита. */
export function appendRounds(existing, added, limit = MAX_ROUNDS) {
  return normalizeRounds([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(added) ? added : [])], limit);
}

/** Глубокая копия раунда. */
export function cloneRound(r) {
  return {
    ...r, dice: r.dice.slice(), styles: r.styles.slice(), hands: r.hands.map((h) => h.slice()),
    bids: r.bids.map((b) => ({ ...b })), end: { ...r.end },
  };
}
