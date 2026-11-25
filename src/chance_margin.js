// chance_margin.js — запас шанса над порогом Тренажёра. Чистый модуль: без DOM.
//
// Игрок видит шанс целым процентом, поэтому и категория считается по округлённому значению:
// что написано на экране, то и сравнивается с порогом.
//   ниже порога       — шанс не выше порога (≤ T)
//   небольшой запас   — выше порога, но меньше чем на 15 процентных пунктов (T+1 … T+14)
//   уверенный запас   — на 15 пунктов и больше (≥ T+15)
// Порог хранится долей (0,05 … 0,95), как в настройках.

export const MARGIN_PP = 15;
export const DEFAULT_THRESHOLD = 0.5;

export const MARGIN_BELOW = 'below';
export const MARGIN_SMALL = 'small';
export const MARGIN_BIG = 'big';

export const MARGIN_LABELS = Object.freeze({
  [MARGIN_BELOW]: 'ниже порога',
  [MARGIN_SMALL]: 'небольшой запас',
  [MARGIN_BIG]: 'уверенный запас',
});

/** Шанс в целых процентах — ровно то, что показывается игроку. */
export function percentOf(p) {
  if (!Number.isFinite(p)) throw new TypeError('percentOf: шанс должен быть числом');
  return Math.round(p * 100);
}

function thresholdPercent(threshold) {
  return Math.round((Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD) * 100);
}

/** 'below' | 'small' | 'big' для шанса p (доля 0…1) при пороге threshold (доля). */
export function marginClass(p, threshold = DEFAULT_THRESHOLD) {
  const r = percentOf(p);
  const t = thresholdPercent(threshold);
  if (r <= t) return MARGIN_BELOW;
  return r < t + MARGIN_PP ? MARGIN_SMALL : MARGIN_BIG;
}

/** Ход проходит порог, если он не «ниже порога». */
export function passesThreshold(p, threshold = DEFAULT_THRESHOLD) {
  return marginClass(p, threshold) !== MARGIN_BELOW;
}

/**
 * Диапазоны для легенды в целых процентах. Пустой диапазон — null (например, уверенный запас при пороге 90%).
 * @returns {{below:number, small:[number,number]|null, big:[number,number]|null}}
 */
export function marginRanges(threshold = DEFAULT_THRESHOLD) {
  const t = thresholdPercent(threshold);
  const smallHi = Math.min(100, t + MARGIN_PP - 1);
  const bigLo = t + MARGIN_PP;
  return {
    below: t,
    small: t + 1 <= smallHi ? [t + 1, smallHi] : null,
    big: bigLo <= 100 ? [bigLo, 100] : null,
  };
}

// ── Поле порога в настройках: целые проценты, шаг 5, от 5 до 95 ──────────────────────────────
export const THRESHOLD_MIN_PCT = 5;
export const THRESHOLD_MAX_PCT = 95;
export const THRESHOLD_STEP_PCT = 5;

const clampPct = (n) => Math.min(THRESHOLD_MAX_PCT, Math.max(THRESHOLD_MIN_PCT, n));

/** Целые проценты из того, что стоит в поле: пусто или не число — 50 %, дальше округление и границы 5–95. */
export function thresholdPercentFromInput(raw) {
  const text = typeof raw === 'string' ? raw.trim().replace(',', '.') : raw;
  const n = text === '' || text === null || text === undefined ? NaN : Number(text);
  return Number.isFinite(n) ? clampPct(Math.round(n)) : Math.round(DEFAULT_THRESHOLD * 100);
}

/** Порог долей (0,05 … 0,95) из значения поля в процентах. */
export function thresholdFromInput(raw) {
  return thresholdPercentFromInput(raw) / 100;
}

/**
 * Значение поля после «−» (dir = -1) или «+» (dir = 1): к ближайшему кратному 5 в нужную сторону.
 * Из 52 «+» даёт 55, «−» даёт 50; на границах 5 и 95 остаётся на месте.
 */
export function stepThresholdPercent(raw, dir) {
  const p = thresholdPercentFromInput(raw);
  const s = THRESHOLD_STEP_PCT;
  return clampPct(dir > 0 ? (Math.floor(p / s) + 1) * s : (Math.ceil(p / s) - 1) * s);
}
