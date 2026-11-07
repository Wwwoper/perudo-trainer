// src/mixed_series.js — упражнение «Серия»: десять однотипных ситуаций с одним и тем же шансом ставки ← чистая логика.
//
// Ставка верна с известным шансом p. В каждой ситуации серии вы выбираете «Верю» или «Не верю!», исход разыгрывается
// по этому шансу. Смысл упражнения — частота: при известном шансе правильнее каждый раз выбирать более вероятную
// сторону, а отдельные исходы всё равно будут разными. Один исход ничего не доказывает, серия показывает картину.
// Модуль без DOM; случайность подаётся снаружи (rng возвращает число в [0, 1)).

export const SERIES_LENGTH = 10;
/** Шансы серий: ставка скорее неверна, на грани, скорее верна. */
export const CHANCES = Object.freeze([0.3, 0.5, 0.7]);
export const ACTIONS = Object.freeze(['believe', 'dudo']);

/** Допустимый шанс: одно из CHANCES, иначе null. */
export function toChance(v) {
  const n = Number(v);
  return CHANCES.includes(n) ? n : null;
}

/**
 * Серия: шанс и исходы заранее (true — ставка в этой ситуации оказалась верной).
 * @param {{chance: number, length?: number, rng?: () => number}} opts
 * @returns {{chance: number, outcomes: boolean[]}|null} null при недопустимом шансе или длине
 */
export function makeSeries({ chance, length = SERIES_LENGTH, rng = Math.random } = {}) {
  const p = toChance(chance);
  if (p === null || !Number.isInteger(length) || length < 1 || length > 100) return null;
  const outcomes = Array.from({ length }, () => rng() < p);
  return { chance: p, outcomes };
}

/** Верно ли решение для исхода: «Верю» — когда ставка верна, «Не верю!» — когда нет. */
export function isRight(action, held) {
  if (action === 'believe') return held === true;
  if (action === 'dudo') return held === false;
  return null;
}

/** Более вероятная сторона при шансе p; на 50 % оба решения равноценны (null). */
export function likelierAction(p) {
  if (p > 0.5) return 'believe';
  if (p < 0.5) return 'dudo';
  return null;
}

/**
 * Итог серии.
 * @param {{chance: number, outcomes: boolean[]}} series
 * @param {string[]} choices решения по порядку (может быть короче серии: считаются только данные)
 * @returns {{n, chance, held, believe, dudo, right, rightShare, expectedShare, allLikelierRight, complete}}
 *   expectedShare — ожидаемая доля верных решений при выборе более вероятной стороны (на 50 % — 0,5);
 *   allLikelierRight — сколько решений было бы верно, если бы в этой серии всегда выбирали более вероятную сторону
 */
export function scoreSeries(series, choices) {
  const outcomes = Array.isArray(series?.outcomes) ? series.outcomes : [];
  const list = (Array.isArray(choices) ? choices : []).slice(0, outcomes.length);
  let believe = 0; let dudo = 0; let right = 0; let n = 0;
  list.forEach((a, i) => {
    const ok = isRight(a, outcomes[i]);
    if (ok === null) return;
    n++;
    if (a === 'believe') believe++; else dudo++;
    if (ok) right++;
  });
  const p = toChance(series?.chance);
  const side = p === null ? null : likelierAction(p);
  const held = outcomes.slice(0, n).filter(Boolean).length;
  let allLikelierRight = null;
  if (p !== null) {
    allLikelierRight = side === null ? null : outcomes.slice(0, n).filter((h) => isRight(side, h)).length;
  }
  return {
    n,
    chance: p,
    held,
    believe,
    dudo,
    right,
    rightShare: n ? right / n : null,
    expectedShare: p === null ? null : Math.max(p, 1 - p),
    allLikelierRight,
    complete: outcomes.length > 0 && n === outcomes.length,
  };
}

const pc = (x) => `${Math.round(x * 100)} %`;

export const SERIES_TITLE = 'Серия ситуаций';
export const SERIES_NOTE = 'Исходы разыгрываются случайно по указанному шансу. Один исход мало говорит о решении, поэтому оценивается вся серия. Время и очки здесь не учитываются.';

/** Условие серии для показа перед ответом. */
export function seriesPrompt(p) {
  return `В каждой ситуации серии ставка верна с шансом ${pc(p)}. Выберите: «Верю» (ставка верна) или «Не верю!» (ставка неверна).`;
}

/** Разбор отдельной ситуации: исход и верность решения. */
export function stepLine(action, held, p) {
  const ok = isRight(action, held);
  if (ok === null) return '';
  return `Ставка ${held ? 'оказалась верной' : 'оказалась неверной'} (шанс был ${pc(p)}). Ваше решение ${ok ? 'совпало с исходом' : 'не совпало с исходом'}. Один исход не оценивает решение.`;
}

/** Строки итога серии (только когда серия закончена; иначе — сколько осталось). */
export function summaryLines(sc, length = SERIES_LENGTH) {
  if (!sc || !sc.n) return [];
  if (!sc.complete) return [`Решений в серии: ${sc.n} из ${length}. Итог появится после последней ситуации.`];
  const lines = [
    `Ставка держалась в ${sc.held} из ${sc.n}. Ваши решения: «Верю» ${sc.believe}, «Не верю!» ${sc.dudo}.`,
    `Совпало с исходом: ${sc.right} из ${sc.n} (${pc(sc.rightShare)}). При выборе более вероятной стороны ожидаемо около ${pc(sc.expectedShare)}.`,
  ];
  if (sc.allLikelierRight !== null) {
    lines.push(`Если бы в этой серии каждый раз выбирали более вероятную сторону, совпало бы ${sc.allLikelierRight} из ${sc.n}: даже верное правило не даёт одинакового результата в каждой серии.`);
  } else {
    lines.push('При шансе 50 % оба решения равноценны: ожидаемая доля совпадений около половины при любом выборе.');
  }
  return lines;
}
