// trainer_text.js — подписи вердикта в Тренажёре. Чистый модуль: без DOM.
//
// Оценка «хорошее / сомнительное» считается по шансу хода и порогу, а не по выигрышу партии (плашку и блок шансов
// собирает trainer_feedback.js).

// Ситуация, где ни один ход не проходит порог: верным считается ход с наибольшим шансом успеха.
export const NO_GOOD_NOTE = 'В этом раскладе ни один ход не проходит порог. Верным считается ход с наибольшим шансом успеха.';

/** Строка «верным был бы…» для неверного ответа; bid — функция, рисующая ставку (текст или html). */
export function correctMoveText(best, pct, bid) {
  if (best.type === 'dudo') return `Верным был бы «Не верю»: проверка сработает с шансом ${pct(best.success)}.`;
  return `Верным было бы повышение ${bid(best.q, best.f)}: ваша ставка верна с шансом ${pct(best.success)}.`;
}

export const TASK_QUESTION = 'Верить ставке соперника и повысить или сказать «Не верю»?';
export const TASK_RULE = 'Верен ход, проходящий порог шанса; если такого хода нет, верен ход с наибольшим шансом успеха.';
export const TASK_TEXT = `${TASK_QUESTION} ${TASK_RULE}`;

/** Шанс для разбора хода: «6,2 %», «50 %» (без лишнего «.0» и с запятой). */
export function chanceText(x) {
  if (!Number.isFinite(x)) return '—';
  const v = Math.round(Math.min(1, Math.max(0, x)) * 1000) / 10;
  return `${String(v).replace('.', ',')} %`;
}

/** Пояснение под списком вариантов: согласовано с оценкой; пусто, если есть повышение, проходящее порог. */
export function optionsNote(options) {
  if (options.some((o) => o.type !== 'dudo' && o.meetsThreshold)) return '';
  if (options.some((o) => o.type === 'dudo' && o.meetsThreshold)) {
    return 'Ни одно повышение не проходит порог, зато «Не верю» сработает с шансом выше порога: здесь верно «Не верю».';
  }
  return 'Ни один ход не проходит порог. Верным считается ход с наибольшим шансом успеха.';
}

/** Порог шанса целыми процентами: 0.55 → «55%» (в настройках, плашке и руководстве одинаково). */
export function thresholdPct(t) {
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
  return `${Math.round(x * 100)}%`;
}

/** Свёрнутая подсказка «Что такое порог шанса»: критерий оценки, а не гарантия; как порог меняет строгость. */
export const THRESHOLD_HELP = Object.freeze([
  'Шанс хода — это шанс, что ваше повышение верно, а у «Не верю» — что проверка сработает. Порог — критерий оценки решения, а не гарантия: ход с хорошим шансом иногда проигрывает, а ход с низким иногда выигрывает.',
  'Выше порог — тренажёр строже: хорошими считаются только надёжные ходы. Ниже порог — допускает больше риска. Порог влияет только на оценку, а не на то, какие ситуации выпадают.',
  'По умолчанию 50 % — с него удобно начинать.',
]);

/** Живая фраза рядом с полем порога (разметка: выделена граница). Режим — его короткое название. */
export function thresholdRuleHtml(t, modeName) {
  const p = Math.round((Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5) * 100);
  return `В режиме «${modeName}» решение будет считаться хорошим, если шанс <b>выше ${p} %</b>.`;
}

/** Подписи у ставки в Тренажёре: у обычной ситуации — ставка соперника, у «Лестницы» — вся история ставок. */
export const BID_LABEL = 'Ставка соперника';
export const BID_LABEL_LADDER = 'История ставок';

function diceWord(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'кубик';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'кубика';
  return 'кубиков';
}

/**
 * Параметры ситуации для строки под панелью: сколько кубиков на столе и как играют единицы.
 * У «Лестницы» добавляется число соперников. Кто сколько держит, не повторяем: свои кубики видно на экране.
 * @returns {{label:string, value:string, accent:boolean}[]}
 */
export function situationParams({ total, wild, opponents = null }) {
  if (!Number.isInteger(total) || total < 1) throw new TypeError('situationParams: число кубиков на столе должно быть целым и положительным');
  const params = [{ label: 'На столе', value: `${total} ${diceWord(total)}`, accent: false }];
  if (Number.isInteger(opponents) && opponents > 0) params.push({ label: 'Соперников', value: String(opponents), accent: false });
  params.push({ label: 'Единицы', value: wild ? 'джокеры' : 'обычные', accent: !!wild });
  return params;
}
