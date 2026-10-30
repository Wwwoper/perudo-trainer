// moments.js — ключевые решения партии: модель, оценка важности, безопасное чтение.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage, ни о движке.
// Хранилище читает и пишет storage.js (ключ perudo.reviews), интерфейс подключается позже.
//
// Момент — одно решение игрока в партии:
//   { id, ts, round, kind: 'raise'|'dudo'|'calza',
//     n: всего кубиков на столе, h: ваши кубики, myDice: сколько у вас кубиков,
//     bid: ставка соперника перед вашим ходом или null (вы ходили первым в раунде),
//     played: ваша ставка (только для kind 'raise') или null,
//     wild: единицы — джокеры?, p: шанс ставки (0…1), code: 'good'|'meh'|'bad',
//     lostDie: потеряли ли вы кубик в этом раунде, tags: [метки],
//     ctx: контекст стола в момент решения или null (в старых записях его нет) }
//
// Контекст (ctx) — то, что игрок видел за столом: { me, dice, styles, bids }.
//   me — ваше место среди живых игроков (0…), dice — кубики каждого живого игрока по местам,
//   styles — стили игроков по местам (null у вас и у тех, чей стиль неизвестен),
//   bids — ставки этого раунда до вашего хода (последние CTX_MAX_BIDS): { s: место автора, q, f }.

export const MOMENT_KINDS = ['raise', 'dudo', 'calza'];
export const MOMENT_CODES = ['good', 'meh', 'bad'];

/** Метки решений. Порядок важен: так они хранятся и показываются. */
export const MOMENT_TAGS = ['dudo', 'raise', 'calza', 'endgame', 'lastDie', 'palifico', 'ones', 'bigTable'];

/** Сколько моментов хранится всего (старые вытесняются первыми). */
export const MAX_MOMENTS = 50;
/** Сколько моментов отбирается из одной партии. */
export const KEY_MOMENTS_PER_GAME = 3;

export const ENDGAME_TOTAL = 6;      // на столе не больше стольких кубиков — эндшпиль
const BIG_TABLE_TOTAL = 25;   // на столе не меньше стольких — большой стол
const MAX_DICE = 100;         // защита от мусора в хранилище
export const CTX_MAX_BIDS = 12;   // сколько последних ставок раунда хранится в контексте
const CTX_MAX_PLAYERS = 6;        // не больше игроков за столом (человек и до пяти ботов)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isFace = (v) => isInt(v) && v >= 1 && v <= 6;

/** Ставка {q, f} с проверкой; иначе null. */
function cleanBid(raw) {
  if (!isObject(raw) || !isInt(raw.q) || raw.q < 1 || raw.q > MAX_DICE || !isFace(raw.f)) return null;
  return { q: raw.q, f: raw.f };
}

/** Проверка контекста стола; для непригодного контекста возвращает null (сам момент остаётся). */
export function sanitizeCtx(raw, { n, myDice } = {}) {
  if (!isObject(raw)) return null;
  const { me, dice, styles, bids } = raw;
  if (!Array.isArray(dice) || dice.length < 2 || dice.length > CTX_MAX_PLAYERS) return null;
  if (!dice.every((d) => isInt(d) && d >= 1 && d <= MAX_DICE)) return null;
  if (!isInt(me) || me < 0 || me >= dice.length) return null;
  if (isInt(n) && dice.reduce((a, b) => a + b, 0) !== n) return null;
  if (isInt(myDice) && dice[me] !== myDice) return null;
  if (!Array.isArray(styles) || styles.length !== dice.length) return null;
  const cleanStyles = styles.map((st, i) => (i !== me && typeof st === 'string' && /^[a-z]{1,20}$/.test(st) ? st : null));
  if (!Array.isArray(bids)) return null;
  const cleanBids = [];
  for (const b of bids) {
    const bid = cleanBid(b);
    if (!bid || !isInt(b.s) || b.s < 0 || b.s >= dice.length) return null;
    cleanBids.push({ s: b.s, q: bid.q, f: bid.f });
  }
  return { me, dice: dice.slice(), styles: cleanStyles, bids: cleanBids.slice(-CTX_MAX_BIDS) };
}

/**
 * Контекст стола из состояния игры.
 * @param {{players: {id:string, dice:number, alive:boolean, style?:string}[],
 *          bidHistory: {playerId:string, q:number, f:number}[], meId: string}} s
 * @returns {object|null} контекст или null, если данные непригодны
 */
export function buildCtx({ players, bidHistory, meId }) {
  if (!Array.isArray(players)) return null;
  const alive = players.filter((p) => p && p.alive !== false);
  const me = alive.findIndex((p) => p.id === meId);
  if (me < 0) return null;
  const seat = new Map(alive.map((p, i) => [p.id, i]));
  const bids = [];
  for (const b of Array.isArray(bidHistory) ? bidHistory : []) {
    if (b && seat.has(b.playerId)) bids.push({ s: seat.get(b.playerId), q: b.q, f: b.f });
  }
  return sanitizeCtx({ me, dice: alive.map((p) => p.dice), styles: alive.map((p) => p.style ?? null), bids });
}

/**
 * Метки решения.
 * @param {{kind: string, total: number, myDice: number, face?: number, palifico?: boolean}} d
 *   face — цифра, о которой решение: ваша ставка или ставка соперника, которую проверяете.
 */
export function decisionTags({ kind, total, myDice, face, palifico }) {
  const set = new Set();
  if (MOMENT_KINDS.includes(kind)) set.add(kind);
  if (total <= ENDGAME_TOTAL) set.add('endgame');
  if (myDice === 1) set.add('lastDie');
  if (palifico) set.add('palifico');
  if (face === 1) set.add('ones');
  if (total >= BIG_TABLE_TOTAL) set.add('bigTable');
  return MOMENT_TAGS.filter((t) => set.has(t));
}

/**
 * Собирает момент из данных решения (проверку и приведение делает sanitizeMoment).
 * Возвращает null, если данные непригодны.
 */
export function buildMoment({ id, ts, round, kind, total, hand, bid = null, played = null, palifico = false, p, code, lostDie = false, ctx = null }) {
  const face = kind === 'raise' ? played?.f : bid?.f;
  return sanitizeMoment({
    id, ts, round, kind,
    n: total,
    h: hand,
    myDice: Array.isArray(hand) ? hand.length : 0,
    bid,
    played: kind === 'raise' ? played : null,
    wild: !palifico,
    p, code, lostDie, ctx,
    tags: decisionTags({ kind, total, myDice: Array.isArray(hand) ? hand.length : 0, face, palifico }),
  });
}

/**
 * Проверяет и очищает момент (из хранилища, из файла копии). Лишние поля отбрасываются.
 * @returns {object|null} чистый момент или null, если запись непригодна
 */
export function sanitizeMoment(raw) {
  if (!isObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : (isInt(raw.id) ? String(raw.id) : '');
  if (!id || id.length > 64) return null;
  if (typeof raw.ts !== 'number' || !Number.isFinite(raw.ts)) return null;
  if (!isInt(raw.round) || raw.round < 0) return null;
  if (!MOMENT_KINDS.includes(raw.kind)) return null;
  if (!isInt(raw.n) || raw.n < 1 || raw.n > MAX_DICE) return null;
  if (!Array.isArray(raw.h) || raw.h.length > 10 || !raw.h.every(isFace)) return null;
  if (!isInt(raw.myDice) || raw.myDice < 0 || raw.myDice > MAX_DICE) return null;
  if (typeof raw.wild !== 'boolean') return null;
  if (typeof raw.p !== 'number' || !(raw.p >= 0 && raw.p <= 1)) return null;
  if (!MOMENT_CODES.includes(raw.code)) return null;

  const bid = raw.bid == null ? null : cleanBid(raw.bid);
  if (raw.bid != null && !bid) return null;
  const played = raw.played == null ? null : cleanBid(raw.played);
  if (raw.played != null && !played) return null;
  if (raw.kind === 'raise' && !played) return null;          // ход-повышение без ставки — запись неполная
  if (raw.kind !== 'raise' && played) return null;
  if (raw.kind !== 'raise' && !bid) return null;             // проверять нечего, если ставки не было

  const tags = Array.isArray(raw.tags) ? MOMENT_TAGS.filter((t) => raw.tags.includes(t)) : [];

  return {
    id, ts: raw.ts, round: raw.round, kind: raw.kind,
    n: raw.n, h: raw.h.slice(), myDice: raw.myDice,
    bid, played, wild: raw.wild, p: raw.p, code: raw.code,
    lostDie: raw.lostDie === true, tags,
    ctx: sanitizeCtx(raw.ctx, { n: raw.n, myDice: raw.myDice }),
  };
}

/**
 * Безопасное чтение списка моментов: мусор отбрасывается, повторы по id схлопываются
 * (остаётся последняя запись), хранится не больше limit самых новых.
 */
export function normalizeMoments(raw, limit = MAX_MOMENTS) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const item of raw) {
    const m = sanitizeMoment(item);
    if (!m) continue;
    byId.delete(m.id);            // повтор уходит в конец, как более новый
    byId.set(m.id, m);
  }
  return [...byId.values()].slice(-limit);
}

/** Добавляет новые моменты к сохранённым с учётом лимита. */
export function appendMoments(existing, added, limit = MAX_MOMENTS) {
  return normalizeMoments([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(added) ? added : [])], limit);
}

/** Режим тренажёра, в котором момент повторяется (режим задаёт пул повторов и правило единиц). */
export function momentMode(m) {
  if (m.wild === false) return 'nowild';
  if (m.n <= ENDGAME_TOTAL) return 'endgame';
  if (m.myDice <= 2) return 'solo';
  if (m.n >= BIG_TABLE_TOTAL) return 'big';
  return 'classic';
}

/** Глубокая копия момента (кубики, метки и контекст). */
export function cloneMoment(m) {
  return {
    ...m, h: m.h.slice(), tags: m.tags.slice(),
    ctx: m.ctx ? { ...m.ctx, dice: m.ctx.dice.slice(), styles: m.ctx.styles.slice(), bids: m.ctx.bids.map((b) => ({ ...b })) } : null,
  };
}

/** Момент можно разыграть в тренажёре: есть ставка соперника, которую нужно оценить. */
export function isReplayable(m) {
  return !!m && !!m.bid && m.h.length > 0 && m.bid.q <= m.n;
}

/** Ситуация для очереди повторов тренажёра или null, если момент разыграть нельзя. */
export function toQueueItem(m) {
  if (!isReplayable(m)) return null;
  return { mode: momentMode(m), n: m.n, h: m.h.slice(), f: m.bid.f, q: m.bid.q, streak: 0 };
}

const SEVERITY = { bad: 3, meh: 1.5, good: 0 };

/**
 * Насколько момент «ключевой». Верное решение — 0, даже если вы потеряли кубик:
 * проигрыш раунда после верного решения — случайность, а не ошибка.
 * Ошибка важнее при малом числе кубиков и при Палифико, а потеря кубика после ошибки
 * делает её заметнее. Чем дальше шанс от 50 %, тем выше оценка.
 */
export function scoreMoment(m) {
  const severity = SEVERITY[m.code] ?? 0;
  if (severity === 0) return 0;
  const weight = 1 + (m.n <= ENDGAME_TOTAL ? 1 : 0) + (m.myDice === 1 ? 1 : 0) + (m.wild === false ? 0.5 : 0);
  const margin = Math.abs(m.p - 0.5);
  return severity * weight * (1 + margin) + (m.lostDie ? 1 : 0);
}

/**
 * До limit самых важных моментов партии, от важного к менее важному.
 * Верные решения не попадают в отбор. При равной важности раньше идёт более ранний раунд.
 */
export function pickKeyMoments(list, limit = KEY_MOMENTS_PER_GAME) {
  return normalizeMoments(list, Number.MAX_SAFE_INTEGER)
    .map((m, i) => ({ m, i, s: scoreMoment(m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.m.round - b.m.round || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.m);
}

/** Названия меток для интерфейса. */
export const TAG_LABELS = {
  dudo: 'проверки ставок',
  raise: 'повышения ставки',
  calza: 'Calza',
  endgame: 'эндшпиль',
  lastDie: 'игра на последнем кубике',
  palifico: 'Палифико',
  ones: 'ставки на единицы',
  bigTable: 'большой стол',
};

const KIND_TAGS = ['dudo', 'raise', 'calza'];

/**
 * Где в партии больше всего ошибок («спорно» и «ошибка» считаются ошибками).
 * Сначала ищутся особые ситуации (эндшпиль, последний кубик, Палифико, единицы, большой стол):
 * они говорят больше, чем «ошибки в проверках вообще». Если в них ошибок нет — берутся типы решений.
 * @returns {{tag: string, label: string, errors: number, total: number} | null}
 */
export function weakestTag(list) {
  const stats = new Map();
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || !Array.isArray(m.tags) || !MOMENT_CODES.includes(m.code)) continue;
    for (const tag of m.tags) {
      if (!MOMENT_TAGS.includes(tag)) continue;
      const s = stats.get(tag) || { tag, errors: 0, total: 0 };
      s.total += 1;
      if (m.code !== 'good') s.errors += 1;
      stats.set(tag, s);
    }
  }
  const rank = (group) => MOMENT_TAGS
    .filter((t) => group(t) && stats.has(t) && stats.get(t).errors > 0)
    .map((t) => stats.get(t))
    .sort((a, b) => b.errors - a.errors || b.errors / b.total - a.errors / a.total)[0];
  const best = rank((t) => !KIND_TAGS.includes(t)) || rank((t) => KIND_TAGS.includes(t));
  return best ? { ...best, label: TAG_LABELS[best.tag] } : null;
}

/** Ситуация уже есть в очереди повторов тренажёра. */
export function isQueued(queue, item) {
  return Array.isArray(queue) && queue.some((x) => isSameSituation(x, item));
}

/**
 * Добавляет ситуацию в очередь повторов, не создавая дублей. Саму очередь не меняет.
 * @returns {{queue: object[], added: boolean}}
 */
export function addToQueue(queue, item) {
  const list = Array.isArray(queue) ? queue : [];
  if (!item || isQueued(list, item)) return { queue: list, added: false };
  return { queue: [...list, { ...item, h: item.h.slice(), streak: 0 }], added: true };
}

/** Две ситуации тренажёра одинаковы (режим, число кубиков, ставка и ваши кубики). */
export function isSameSituation(a, b) {
  return !!a && !!b && a.mode === b.mode && a.n === b.n && a.q === b.q && a.f === b.f
    && Array.isArray(a.h) && Array.isArray(b.h) && a.h.length === b.h.length && a.h.every((d, i) => d === b.h[i]);
}
