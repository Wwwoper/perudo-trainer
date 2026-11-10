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
