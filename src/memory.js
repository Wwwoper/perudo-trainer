// memory.js — что боты запоминают об игроке-человеке.
// Чистая логика без DOM и localStorage: сохранением занимается app_v2.js через storage.js.
//
// Боты видят то же, что увидел бы живой соперник за столом: только те ставки
// человека, которые кто-то проверил («Не верю»). Не проверенные ставки остаются
// тайной, поэтому оценка блефа неполная — как и у людей.

export const MEMORY_VERSION = 1;

export const PRIOR_RATE = 0.3;     // с какой долей блефа бот считает нового соперника
export const PRIOR_WEIGHT = 5;     // вес этого предположения, в «наблюдениях»
export const MAX_SAMPLES = 200;    // дальше старые наблюдения «выцветают»

export function createMemory() {
  return { v: MEMORY_VERSION, challenged: 0, bluffs: 0 };
}

const isCount = (n) => Number.isFinite(n) && n >= 0;

/** Любое значение из хранилища → корректная память (испорченное заменяется пустой). */
export function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return createMemory();
  const challenged = Math.floor(Number(raw.challenged));
  const bluffs = Math.floor(Number(raw.bluffs));
  if (!isCount(challenged) || !isCount(bluffs) || bluffs > challenged) return createMemory();
  return { v: MEMORY_VERSION, challenged, bluffs };
}

/** Учесть одну проверенную ставку человека: wasBluff — ставка оказалась ложной. */
export function recordChallenge(memory, wasBluff) {
  let { challenged, bluffs } = normalizeMemory(memory);
  challenged += 1;
  if (wasBluff) bluffs += 1;
  if (challenged > MAX_SAMPLES) {          // забываем старое, чтобы бот успевал за сменой манеры игры
    challenged = Math.round(challenged / 2);
    bluffs = Math.min(challenged, Math.round(bluffs / 2));
  }
  return { v: MEMORY_VERSION, challenged, bluffs };
}

/** Доля блефа с поправкой на малое число наблюдений (сглаживание к PRIOR_RATE). */
export function bluffRate(memory) {
  const { challenged, bluffs } = normalizeMemory(memory);
  return (bluffs + PRIOR_RATE * PRIOR_WEIGHT) / (challenged + PRIOR_WEIGHT);
}

/** Что передаётся в botDecide как state.opponent. */
export function opponentModel(memory) {
  const m = normalizeMemory(memory);
  return { bluffRate: bluffRate(m), samples: m.challenged };
}

/**
 * Обновить память по событию движка. Учитывается только проверка («Не верю»)
 * ставки игрока humanId; всё остальное возвращает ту же память.
 */
export function observeEvent(memory, event, humanId) {
  if (!event || event.type !== 'DICE_REVEALED' || event.kind !== 'dudo') return memory;
  if (event.bidderId !== humanId) return memory;
  return recordChallenge(memory, event.bidSuccessful === false);
}

/** Короткое описание для настроек: «Наблюдений: 12, блеф ≈ 40%». */
export function describeMemory(memory) {
  const m = normalizeMemory(memory);
  if (m.challenged < 3) return `Боты пока присматриваются: проверено ставок — ${m.challenged}.`;
  return `Проверено ваших ставок: ${m.challenged}, из них ложных ≈ ${Math.round(bluffRate(m) * 100)}%.`;
}
