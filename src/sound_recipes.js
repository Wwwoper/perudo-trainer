// sound_recipes.js — из чего состоят звуки: ноты с высотой, длительностью и формой волны.
//
// Только данные (без Web Audio), чтобы их можно было проверить в тестах: каждый звук из sound_plan.js
// имеет рецепт, укладывается в свою длительность и не выходит за разумные частоты и громкость.
//
// Нота: { at, dur, freq, to?, type, gain }
//   at, dur — начало и длительность внутри звука, мс;
//   freq    — частота, Гц; to — частота в конце (плавный сдвиг), если задана;
//   type    — форма волны (sine, triangle, square, sawtooth);
//   gain    — относительная громкость ноты, 0…1 (общая громкость задаётся режимом «тихо» / «обычно»).

export const WAVE_TYPES = Object.freeze(['sine', 'triangle', 'square', 'sawtooth']);
export const FREQ_MIN = 60;
export const FREQ_MAX = 4000;
export const GAIN_MAX = 0.6;

export const RECIPES = Object.freeze({
  // ваш ход: два мягких тона вверх
  turn: [
    { at: 0, dur: 70, freq: 660, type: 'sine', gain: 0.5 },
    { at: 70, dur: 90, freq: 880, type: 'sine', gain: 0.5 },
  ],
  // «Не верю!»: два тона вниз, резче
  dudo: [
    { at: 0, dur: 110, freq: 330, type: 'square', gain: 0.35 },
    { at: 110, dur: 110, freq: 220, type: 'square', gain: 0.4 },
  ],
  // Calza: светлый двойной тон
  calza: [
    { at: 0, dur: 220, freq: 523, type: 'triangle', gain: 0.35 },
    { at: 0, dur: 220, freq: 784, type: 'triangle', gain: 0.3 },
  ],
  // потеря кубика: низкий тон с падением
  'lose-die': [
    { at: 0, dur: 260, freq: 200, to: 110, type: 'sine', gain: 0.55 },
  ],
  // победа: арпеджио вверх
  win: [
    { at: 0, dur: 200, freq: 523, type: 'triangle', gain: 0.4 },
    { at: 200, dur: 200, freq: 659, type: 'triangle', gain: 0.4 },
    { at: 400, dur: 200, freq: 784, type: 'triangle', gain: 0.4 },
    { at: 600, dur: 300, freq: 1047, type: 'triangle', gain: 0.45 },
  ],
  // поражение: ступени вниз
  lose: [
    { at: 0, dur: 200, freq: 392, type: 'sine', gain: 0.45 },
    { at: 200, dur: 200, freq: 330, type: 'sine', gain: 0.45 },
    { at: 400, dur: 200, freq: 262, type: 'sine', gain: 0.45 },
    { at: 600, dur: 300, freq: 196, type: 'sine', gain: 0.5 },
  ],
  // раздача кубиков: три коротких щелчка разной высоты
  deal: [
    { at: 0, dur: 40, freq: 1200, type: 'triangle', gain: 0.25 },
    { at: 50, dur: 40, freq: 1500, type: 'triangle', gain: 0.25 },
    { at: 100, dur: 40, freq: 1000, type: 'triangle', gain: 0.25 },
  ],
  // недопустимая ставка: короткий низкий отказ
  illegal: [
    { at: 0, dur: 120, freq: 140, type: 'square', gain: 0.3 },
  ],
  // ваша ставка и ставка бота: лёгкий щелчок, у бота ниже и тише
  bid: [
    { at: 0, dur: 70, freq: 900, type: 'sine', gain: 0.3 },
  ],
  'bid-bot': [
    { at: 0, dur: 70, freq: 700, type: 'sine', gain: 0.22 },
  ],
});

/** Звук должен занимать хотя бы эту долю отведённой ему длительности (иначе он «обрезан» и неразличим). */
export const MIN_FILL = 0.5;

/**
 * Проверка рецепта. Возвращает список проблем по-русски; пусто — рецепт годится.
 * @param {unknown} notes   ноты звука
 * @param {number} [cueDur] длительность звука из sound_plan.js (мс); если не задана, она не проверяется
 */
export function validateRecipe(notes, cueDur) {
  if (!Array.isArray(notes) || notes.length === 0) return ['нет ни одной ноты'];
  const problems = [];
  let end = 0;
  notes.forEach((n, i) => {
    const p = `нота ${i + 1}`;
    if (!n || typeof n !== 'object') { problems.push(`${p}: это не нота`); return; }
    if (!Number.isInteger(n.at) || n.at < 0) problems.push(`${p}: начало — целое число мс, не меньше 0`);
    if (!Number.isInteger(n.dur) || n.dur < 20) problems.push(`${p}: длительность — целое число мс, не меньше 20`);
    if (!Number.isFinite(n.freq) || n.freq < FREQ_MIN || n.freq > FREQ_MAX) problems.push(`${p}: частота от ${FREQ_MIN} до ${FREQ_MAX} Гц`);
    if (n.to !== undefined && (!Number.isFinite(n.to) || n.to < FREQ_MIN || n.to > FREQ_MAX)) problems.push(`${p}: конечная частота от ${FREQ_MIN} до ${FREQ_MAX} Гц`);
    if (!Number.isFinite(n.gain) || n.gain <= 0 || n.gain > GAIN_MAX) problems.push(`${p}: громкость больше 0 и не выше ${GAIN_MAX}`);
    if (!WAVE_TYPES.includes(n.type)) problems.push(`${p}: тембр — ${WAVE_TYPES.join(', ')}`);
    if (Number.isInteger(n.at) && Number.isInteger(n.dur)) end = Math.max(end, n.at + n.dur);
  });
  if (Number.isFinite(cueDur) && !problems.length) {
    if (end > cueDur) problems.push(`звук длится ${end} мс, а отведено не больше ${cueDur} мс`);
    else if (end < cueDur * MIN_FILL) problems.push(`звук слишком короткий: ${end} мс из ${cueDur} мс`);
  }
  return problems;
}

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`);
const num = (v) => String(v);

/** Рецепт одного звука в том виде, в каком он записан в этом файле: «имя: [ …ноты… ],». */
export function formatRecipe(name, notes) {
  const lines = notes.map((n) => {
    const parts = [`at: ${num(n.at)}`, `dur: ${num(n.dur)}`, `freq: ${num(n.freq)}`];
    if (n.to !== undefined) parts.push(`to: ${num(n.to)}`);
    parts.push(`type: '${n.type}'`, `gain: ${num(n.gain)}`);
    return `    { ${parts.join(', ')} },`;
  });
  return `  ${key(name)}: [\n${lines.join('\n')}\n  ],`;
}

/** Все рецепты: вставляется между «Object.freeze({» и «});» (комментарии к звукам при этом теряются). */
export function formatRecipes(recipes) {
  return Object.entries(recipes).map(([name, notes]) => formatRecipe(name, notes)).join('\n');
}
