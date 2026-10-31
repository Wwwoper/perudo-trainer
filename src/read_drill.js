// read_drill.js — упражнение «Читай вскрытие»: по ставкам раунда угадать, была ли нужная цифра в руке автора.
//
// Чистый модуль: без DOM и хранилища. Раунд берётся из rounds.js (sanitizeRound), ответы проверяются по рукам,
// которые стали известны при вскрытии. Задание (task) чужих рук и итога раунда не содержит:
// в интерфейс уходит только то, что видел бы игрок до вскрытия.

import { saidText, dieMatches } from './reveal.js';

/** Сколько вопросов в одном задании. */
export const MAX_QUESTIONS = 3;
/** Допустимые ответы: «в руке есть нужная цифра» и «в руке её нет». */
export const ANSWERS = ['has', 'none'];

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Подпись места за столом: «Вы» или «Игрок N» (имена ботов в раунде не хранятся). */
export function seatLabel(round, seat) {
  return seat === round.me ? 'Вы' : `Игрок ${seat + 1}`;
}

/** Годится ли раунд для упражнения: вы были за столом и кто-то другой назвал хотя бы одну ставку. */
export function canRead(round) {
  return !!round && Number.isInteger(round.me) && round.me >= 0
    && Array.isArray(round.bids) && round.bids.some((b) => b.s !== round.me);
}

/**
 * Шанс, что среди size кубиков есть хотя бы один нужной грани (до любых ставок).
 * Единицы-джокеры считаются, если wild и грань не 1.
 */
export function priorHas(size, face, wild) {
  const p = (face === 1 || !wild) ? 1 / 6 : 1 / 3;
  return 1 - Math.pow(1 - p, Math.max(0, size));
}

/**
 * Выбор раунда: сначала ещё не показанные, затем любой подходящий.
 * @param {object[]} rounds раунды из хранилища
 * @param {Set<string>} seen id уже показанных раундов
 * @param {() => number} rnd источник случайных чисел [0,1)
 * @returns {object|null}
 */
export function pickReadRound(rounds, seen = new Set(), rnd = Math.random) {
  const ok = (Array.isArray(rounds) ? rounds : []).filter(canRead);
  if (!ok.length) return null;
  const fresh = ok.filter((r) => !seen.has(r.id));
  const pool = fresh.length ? fresh : ok;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/**
 * Задание по раунду: ваша рука, число кубиков, ставки по порядку и до MAX_QUESTIONS вопросов
 * «была ли в руке автора нужная цифра» (по чужим ставкам; повтор «автор + цифра» не спрашивается дважды).
 * @returns {object|null}
 */
export function buildReadTask(round, { rnd = Math.random, max = MAX_QUESTIONS } = {}) {
  if (!canRead(round)) return null;
  const bids = round.bids.map((b, i) => ({ n: i + 1, seat: b.s, q: b.q, f: b.f, isMe: b.s === round.me }));
  const seen = new Set();
  let cand = bids.filter((b) => {
    if (b.isMe) return false;
    const key = `${b.seat}:${b.f}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // случайные max вопросов, порядок затем возвращается к порядку ставок
  const pool = cand.slice();
  const chosen = [];
  while (pool.length && chosen.length < Math.max(1, max)) {
    chosen.push(pool.splice(Math.min(pool.length - 1, Math.floor(rnd() * pool.length)), 1)[0]);
  }
  cand = chosen.sort((a, b) => a.n - b.n);
  return {
    id: round.id,
    wild: round.wild,
    me: round.me,
    hand: round.hands[round.me].slice(),
    dice: round.dice.slice(),
    bids,
    questions: cand.map((b) => {
      const size = round.dice[b.seat];
      return { n: b.n, seat: b.seat, q: b.q, f: b.f, size, prior: priorHas(size, b.f, round.wild) };
    }),
  };
}

/**
 * Проверка ответов по рукам вскрытия.
 * @param {object} round тот же раунд, из которого собрано задание
 * @param {object} task результат buildReadTask
 * @param {Object<number,string>} answers номер ставки → 'has' | 'none'
 * @returns {{items: object[], good: number, total: number, lines: string[], outcome: string}|null} null, если ответы неполные или неверные
 */
export function checkReadAnswers(round, task, answers) {
  if (!round || !task || task.id !== round.id || !answers || typeof answers !== 'object') return null;
  const items = [];
  for (const qn of task.questions) {
    const a = answers[qn.n];
    if (!ANSWERS.includes(a)) return null;
    const hand = round.hands[qn.seat] || [];
    const matches = hand.filter((d) => dieMatches(d, qn.f, round.wild)).length;
    const truth = matches > 0 ? 'has' : 'none';
    const text = saidText({ q: qn.q, f: qn.f, matches, size: hand.length });
    items.push({ n: qn.n, seat: qn.seat, q: qn.q, f: qn.f, answer: a, truth, ok: a === truth, matches, size: hand.length, prior: qn.prior, text });
  }
  const good = items.filter((i) => i.ok).length;
  const lines = [];
  for (const it of items) {
    const chance = `${Math.round(it.prior * 100)} %`;
    lines.push(`Ставка ${it.n}: ${it.text}. Без других сведений шанс, что среди ${it.size} ${plural(it.size, 'кубика', 'кубиков', 'кубиков')} есть нужная цифра, около ${chance}.`);
  }
  if (items.some((i) => i.truth === 'none')) {
    lines.push('Если нужной цифры в руке автора не было, это ещё не блеф: ставка могла опираться на кубики других игроков.');
  }
  const last = round.bids[round.bids.length - 1];
  const e = round.end;
  const head = e.kind === 'calza' ? `Calza на ${last.q}×${last.f}` : `Проверка ставки ${last.q}×${last.f}`;
  const verdict = e.kind === 'calza' ? (e.ok ? 'точно' : 'мимо') : (e.ok ? 'ставка верна' : 'ставка ложна');
  const outcome = `${head}: на столе ${e.actual}, ${verdict}.`;
  return { items, good, total: items.length, lines, outcome };
}
