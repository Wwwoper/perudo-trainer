// src/calibration.js — калибровка вероятностных ответов в «Читай вскрытие» ← чистая логика (без DOM и хранилища).
//
// Игрок называет уверенность 0–100 %, что у автора ставки в руке есть нужная цифра. Один исход (есть / нет)
// почти ничего не говорит о качестве оценки: можно угадать при плохой уверенности и промахнуться при хорошей.
// Поэтому оценка серии считается отдельно: средняя квадратичная ошибка прогноза (показатель Брайера, меньше — лучше)
// и сравнение с «базовой» оценкой по начальному шансу (без чтения ставок) и по частоте в полосах уверенности.

/** Минимум ответов в серии, чтобы показывать оценку серии. */
export const MIN_SERIES = 10;
/** Сколько последних ответов серии хранится (ограничение памяти страницы). */
export const MAX_SERIES = 200;
/** Шаг ползунка и значение по умолчанию. */
export const STEP = 5;

const isP = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

/** Целая уверенность 0–100 → вероятность 0–1 или null. */
export function toProbability(percent) {
  const n = typeof percent === 'string' && percent.trim() !== '' ? Number(percent) : percent;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n / 100 : null;
}

/** Квадратичная ошибка одного прогноза: p — вероятность «есть», truth — было ли на самом деле. */
export function brierItem(p, truth) {
  return (p - (truth ? 1 : 0)) ** 2;
}

/** Прогноз «верный по стороне»: ошибка меньше 0,25 (то есть уверенность по правильную сторону от 50 %). */
export function sideCorrect(p, truth) {
  return brierItem(p, truth) < 0.25;
}

/** Запись серии или null: p — ваша вероятность, prior — начальный шанс, truth — что было. */
export function makeEntry({ p, prior, truth }) {
  if (!isP(p) || !isP(prior) || typeof truth !== 'boolean') return null;
  return { p, prior, truth };
}

/** Серия с добавленной записью (исходная не меняется); хранятся последние MAX_SERIES. */
export function addEntry(series, entry) {
  const list = Array.isArray(series) ? series : [];
  if (!entry) return list.slice(-MAX_SERIES);
  return [...list, entry].slice(-MAX_SERIES);
}

/** Полосы уверенности: «низкая», «средняя», «высокая». */
export const BANDS = Object.freeze([
  Object.freeze({ id: 'low', label: 'до 33 %', test: (p) => p < 0.34 }),
  Object.freeze({ id: 'mid', label: '34–66 %', test: (p) => p >= 0.34 && p <= 0.66 }),
  Object.freeze({ id: 'high', label: 'от 67 %', test: (p) => p > 0.66 }),
]);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Оценка серии.
 * @returns {{n: number, enough: boolean, brier: number|null, base: number|null, better: boolean|null,
 *   bands: {id: string, label: string, n: number, said: number, actual: number}[]}}
 */
export function seriesSummary(series, { min = MIN_SERIES } = {}) {
  const list = (Array.isArray(series) ? series : []).filter((e) => e && makeEntry(e));
  const n = list.length;
  if (!n) return { n: 0, enough: false, brier: null, base: null, better: null, bands: [] };
  const brier = mean(list.map((e) => brierItem(e.p, e.truth)));
  const base = mean(list.map((e) => brierItem(e.prior, e.truth)));
  const bands = BANDS.map((b) => {
    const part = list.filter((e) => b.test(e.p));
    return part.length
      ? { id: b.id, label: b.label, n: part.length, said: mean(part.map((e) => e.p)), actual: mean(part.map((e) => (e.truth ? 1 : 0))) }
      : null;
  }).filter(Boolean);
  const enough = n >= min;
  return { n, enough, brier, base, better: enough ? brier < base : null, bands };
}

const pct = (x) => `${Math.round(x * 100)} %`;
const fix2 = (x) => x.toFixed(2).replace('.', ',');

/** Строки для показа: единичный исход — отдельно, серия — когда набрано достаточно ответов. */
export function itemLine({ p, truth }) {
  return `Ваша уверенность ${pct(p)}. В руке цифра ${truth ? 'была' : 'не была'}. ` +
    `Ошибка прогноза ${fix2(brierItem(p, truth))} (меньше — лучше).`;
}

export function seriesLines(sum, { min = MIN_SERIES } = {}) {
  if (!sum || !sum.n) return [];
  if (!sum.enough) {
    return [`Оценка серии появится после ${min} ответов. Сейчас: ${sum.n}. Один исход мало говорит о качестве оценки.`];
  }
  const lines = [
    `Серия из ${sum.n} ответов: средняя ошибка прогноза ${fix2(sum.brier)}. ` +
      `Без чтения ставок, по одному начальному шансу, она была бы ${fix2(sum.base)}.`,
    sum.better
      ? 'Ваши оценки точнее, чем начальный шанс: ставки вы читаете с пользой.'
      : 'Пока ваши оценки не точнее начального шанса: попробуйте осторожнее отходить от него.',
  ];
  for (const b of sum.bands) {
    lines.push(`Когда вы называли ${b.label}, цифра была в руке в ${pct(b.actual)} случаев (ответов: ${b.n}).`);
  }
  return lines;
}
