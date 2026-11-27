// trainer_feedback.js — данные для разбора ответа в Тренажёре. Чистый модуль: без DOM.
//
// Разбор состоит из плашки («Хорошее / Сомнительное решение», шанс хода и порог) и, для повышения,
// блока «Шанс при повышении»: выбранная ставка и её соседи по количеству (на кубик меньше и больше).
// Оценка по шансу, а не по исходу раунда: об этом одна оговорка под блоком.

import { legal } from './rules.js';
import { marginClass, marginRanges, percentOf, MARGIN_LABELS, MARGIN_BELOW, MARGIN_SMALL, MARGIN_BIG } from './chance_margin.js';

export const TITLE_GOOD = 'Хорошее решение';
export const TITLE_BAD = 'Сомнительное решение';
export const RAISE_BLOCK_TITLE = 'Шанс при повышении';
export const FEEDBACK_NOTE = 'Оценка по шансу, а не по итогу раунда: хороший ход может проиграть.';

/** Шанс для строк и плашки целым процентом, как его видит игрок и сравнивает порог: «<1 %», «45 %», «>99 %». */
export function plainChance(p) {
  const r = percentOf(p);
  if (p < 0.005) return '<1 %';
  if (r > 99) return '>99 %';
  return `${r} %`;
}

/**
 * Плашка итога.
 * @param {{kind:'raise'|'dudo', good:boolean, noGoodMove?:boolean, chance:number, threshold:number, noGoodNote:string}} s
 * @returns {{tone:'good'|'bad', title:string, line:string, extra:string}}
 */
export function plaqueModel({ kind, good, noGoodMove = false, chance, threshold, noGoodNote = '' }) {
  const T = `${percentOf(threshold)} %`;
  const what = kind === 'dudo' ? 'Шанс, что «Не верю» сработает,' : 'Шанс вашей ставки';
  return {
    tone: good ? 'good' : 'bad',
    title: good ? TITLE_GOOD : TITLE_BAD,
    line: `${what} — ${plainChance(chance)} при пороге ${T}.`,
    extra: noGoodMove ? noGoodNote : '',
  };
}

/**
 * Единая строка варианта — ставка или «Не верю»: что это, шанс целым процентом, категория запаса,
 * выбор игрока (рисуется полосой, без текста) и короткая метка («лучший»).
 * @param {{kind:'raise'|'dudo', q?:number, f?:number, chance:number, threshold:number, chosen?:boolean, tag?:string}} s
 * @returns {{kind:string, q:(number|null), f:(number|null), chance:number, margin:string, label:string, chosen:boolean, tag:string}}
 */
export function optionRow({ kind, q = null, f = null, chance, threshold, chosen = false, tag = '' }) {
  if (kind !== 'raise' && kind !== 'dudo') throw new TypeError(`optionRow: неизвестный вид варианта «${kind}»`);
  if (kind === 'raise' && !(Number.isInteger(q) && Number.isInteger(f))) throw new TypeError('optionRow: у ставки нужны количество и грань');
  const margin = marginClass(chance, threshold);   // бросает TypeError на нечисловой шанс
  return { kind, q: kind === 'raise' ? q : null, f: kind === 'raise' ? f : null, chance, margin, label: MARGIN_LABELS[margin], chosen: !!chosen, tag };
}

/**
 * Строки блока «Шанс при повышении»: ставка на кубик меньше, выбранная и на кубик больше (грань та же).
 * Недопустимые варианты (не выше ставки соперника или выходят за число кубиков на столе) не выводятся.
 * @param {{q:number, f:number, bid:{q:number,f:number}, total:number, wild?:boolean, threshold:number,
 *          chanceOf:(q:number, f:number) => number}} s
 * @returns {ReturnType<typeof optionRow>[]}
 */
export function raiseNeighbours({ q, f, bid, total, wild = true, threshold, chanceOf }) {
  if (typeof chanceOf !== 'function') throw new TypeError('raiseNeighbours: нужна функция chanceOf');
  const rules = { wild: wild !== false };
  const rows = [];
  for (const d of [-1, 0, 1]) {
    const n = q + d;
    if (n < 1 || n > total) continue;
    if (!legal(n, f, bid, rules)) continue;
    rows.push(optionRow({ kind: 'raise', q: n, f, chance: chanceOf(n, f), threshold, chosen: d === 0 }));
  }
  return rows;
}

/**
 * Легенда категорий для порога: пустые диапазоны не выводятся.
 * @returns {{margin:string, text:string}[]} порядок: небольшой запас, уверенный запас, ниже порога
 */
export function legendItems(threshold) {
  const r = marginRanges(threshold);
  const span = ([lo, hi]) => (lo === hi ? `${lo} %` : `${lo}–${hi} %`);
  const items = [];
  if (r.small) items.push({ margin: MARGIN_SMALL, text: `${span(r.small)} · ${MARGIN_LABELS[MARGIN_SMALL]}` });
  if (r.big) items.push({ margin: MARGIN_BIG, text: `${span(r.big)} · ${MARGIN_LABELS[MARGIN_BIG]}` });
  items.push({ margin: MARGIN_BELOW, text: `≤ ${r.below} % · ${MARGIN_LABELS[MARGIN_BELOW]}` });
  return items;
}
