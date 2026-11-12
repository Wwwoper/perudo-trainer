// quiz_text.js — тексты викторины «Читай стол»: подписи прогресса, результата ответа и конца серии.
// Чистый модуль: только строки, без разметки и браузера.

/** «1 балл», «2 балла», «5 баллов». */
export function pointsText(n) {
  const k = Math.abs(Math.trunc(Number(n) || 0));
  const m10 = k % 10;
  const m100 = k % 100;
  const word = (m10 === 1 && m100 !== 11) ? 'балл'
    : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'балла' : 'баллов';
  return `${k} ${word}`;
}

/** Подпись над вопросом: «Стол 2 из 5 · вопрос 3 из 4». */
export function progressLabel({ table, q }, tables, perTable) {
  return `Стол ${table + 1} из ${tables} · вопрос ${q + 1} из ${perTable}`;
}

/**
 * Короткий вердикт после ответа.
 * @param {{ok:boolean, points:number, max:number}} result
 * @returns {{tone:'ok'|'near'|'bad', text:string}}
 */
export function resultLine(result) {
  if (result.ok) {
    return { tone: 'ok', text: result.max > 1 ? `Точно, +${pointsText(result.points)}` : `Верно, +${pointsText(result.points)}` };
  }
  if (result.points > 0) return { tone: 'near', text: `Почти: ошибка в один кубик, +${pointsText(result.points)}` };
  return { tone: 'bad', text: 'Мимо, 0 баллов' };
}

/** Строка в конце серии: «Верно: 14 из 20. Баллов: 17 из 24.» */
export function endLine({ correct, total, points, max }) {
  return `Верно: ${correct} из ${total}. Баллов: ${points} из ${max}.`;
}

const pct = (x) => `${Math.round(x * 100)} %`;

/** Разница в баллах за серию, начиная с которой её уже можно назвать заметной. */
export const SURE_GAP = 3;

/**
 * Итог серии для экрана: заголовок, сравнение с ответом «всегда одно и то же», строки по видам вопросов и слабое место.
 * @param {ReturnType<import('./quiz_series.js').summarize>} sum
 */
export function summaryView(sum) {
  // Одна серия — 20 вопросов, и случайный разброс у неё около двух баллов: «лучше» и «хуже» говорим только при заметной разнице.
  const compare = sum.gain >= SURE_GAP
    ? 'Это заметно лучше, чем отвечать одним и тем же ответом.'
    : sum.gain <= -SURE_GAP
      ? 'Это хуже, чем отвечать одним и тем же ответом: ставки пока читаются слабо.'
      : 'Разница с одним и тем же ответом в пределах случайного: по одной серии судить рано.';
  return {
    headline: `${sum.correct} из ${sum.total}`,
    points: `Баллов: ${sum.points} из ${sum.max}. Если на каждый вопрос всегда отвечать одним и тем же ответом, набралось бы около ${Math.round(sum.guess)}. ${compare}`,
    kinds: sum.kinds.map((k) => ({
      kind: k.kind, name: k.name, text: `${k.correct} из ${k.n}`,
      rate: Math.round(k.rate * 100), guess: Math.round(k.guessRate * 100),
      note: `при одном и том же ответе на все такие вопросы: ${pct(k.guessRate)}`,
    })),
    weak: sum.weakest
      ? `Слабее всего вышел вид «${sum.weakest.name}»: ${pct(sum.weakest.rate)} баллов, а при одном и том же ответе было бы ${pct(sum.weakest.guessRate)}.`
      : 'Ни один вид вопросов не вышел хуже ответа «всегда одно и то же».',
  };
}

const DIE_CHARS = '⚀⚁⚂⚃⚄⚅';

/**
 * Разбивает строку вопроса на части: обычный текст и грани кубиков. Символ ⚃ в текстах вопросов заменяется
 * на нарисованный кубик в интерфейсе: сам символ мелкий, и ⚁/⚂ и ⚃/⚄ легко спутать.
 * @param {string} text
 * @returns {({text:string}|{face:number})[]}
 */
export function splitDice(text) {
  const out = [];
  let buf = '';
  for (const ch of String(text ?? '')) {
    const i = DIE_CHARS.indexOf(ch);
    if (i < 0) { buf += ch; continue; }
    if (buf) { out.push({ text: buf }); buf = ''; }
    out.push({ face: i + 1 });
  }
  if (buf) out.push({ text: buf });
  return out;
}
