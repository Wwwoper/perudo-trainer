// read_drill.js — упражнение «Читай вскрытие»: по ставкам раунда угадать, была ли нужная цифра в руке автора.
//
// Чистый модуль: без DOM и хранилища. Раунд берётся из rounds.js (sanitizeRound), ответы проверяются по рукам,
// которые стали известны при вскрытии. Задание (task) чужих рук и итога раунда не содержит:
// в интерфейс уходит только то, что видел бы игрок до вскрытия.

import { saidText, dieMatches } from './reveal.js';
import { BOT_NAMES } from './bots.js';

/** Сколько вопросов в одном задании. */
export const MAX_QUESTIONS = 3;
const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Число из строки: одинаковое для одной и той же строки (FNV-1a). */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Детерминированный генератор случайных чисел по зерну (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Имена соперников раунда. Если раунд хранит настоящие имена из партии (round.names), берутся они;
 * для остальных мест — имена из списка имён ботов: в одном раунде разные, для одного раунда всегда одни и те же
 * (зерно — идентификатор раунда). Ваше место — «Вы».
 * @returns {string[]} имя для каждого места
 */
export function seatNames(round) {
  const n = Array.isArray(round?.dice) ? round.dice.length : 0;
  const stored = Array.isArray(round?.names) ? round.names : [];
  const used = new Set(stored.filter((v, i) => typeof v === 'string' && v && i !== round.me));
  const rnd = seeded(hashString(String(round?.id ?? '')));
  const pool = BOT_NAMES.filter((x) => !used.has(x));
  for (let i = pool.length - 1; i > 0; i--) {   // перемешивание Фишера — Йетса
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let k = 0;
  const names = [];
  for (let seat = 0; seat < n; seat++) {
    if (seat === round.me) { names.push('Вы'); continue; }
    const own = stored[seat];
    if (typeof own === 'string' && own) { names.push(own); continue; }
    names.push(k < pool.length ? pool[k] : `Игрок ${seat + 1}`);
    k++;
  }
  return names;
}

/** Подпись места за столом: «Вы» или имя из списка имён ботов. */
export function seatLabel(round, seat) {
  if (seat === round.me) return 'Вы';
  return seatNames(round)[seat] ?? `Игрок ${seat + 1}`;
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
 * Строки ленты ставок: порядок торгов с подписью действия и пометкой тех ставок, о которых задан вопрос.
 * Подписи без родов («Первая ставка», «Повышение»): имена в списке мужские и женские.
 * @returns {{n:number, seat:number, q:number, f:number, isMe:boolean, asked:boolean, action:string}[]}
 */
export function feedRows(task) {
  if (!task || !Array.isArray(task.bids)) return [];
  const asked = new Set((task.questions || []).map((q) => q.n));
  return task.bids.map((b, i) => ({
    n: b.n, seat: b.seat, q: b.q, f: b.f, isMe: !!b.isMe, asked: asked.has(b.n),
    action: i === 0 ? 'Первая ставка' : 'Повышение',
  }));
}

/**
 * Факты для вопроса: что игрок знает до вскрытия. Считается по заданию, чужих рук в нём нет.
 * @param {object} task результат buildReadTask
 * @param {{n:number, q:number, f:number, size:number}} q один из вопросов задания
 * @returns {{size:number, total:number, hidden:number, mine:number, mineDice:{v:number, match:boolean}[], need:number}}
 *   size — кубиков в руке автора, total — всего за столом, hidden — скрыто от вас,
 *   mine — ваших подходящих кубиков (с джокерами), need — сколько ещё нужно среди скрытых, чтобы ставка была верна
 */
export function knownFacts(task, q) {
  const hand = Array.isArray(task?.hand) ? task.hand : [];
  const dice = Array.isArray(task?.dice) ? task.dice : [];
  const total = dice.reduce((a, b) => a + b, 0);
  const mineDice = hand.slice().sort((a, b) => a - b).map((v) => ({ v, match: dieMatches(v, q.f, !!task.wild) }));
  const mine = mineDice.filter((d) => d.match).length;
  return {
    size: q.size, total, hidden: Math.max(0, total - hand.length), mine, mineDice,
    need: Math.max(0, q.q - mine),
  };
}

/**
 * Подсказка «Режима новичка»: начальный шанс нужной цифры до всех рассуждений о ставках.
 * @param {{f:number, size:number, prior:number}} q вопрос задания
 * @param {boolean} wild единицы — джокеры
 * @returns {string}
 */
export function priorHint(q, wild) {
  const jokers = !!wild && q.f !== 1;
  const one = jokers ? '1 из 3' : '1 из 6';
  const pct = jokers ? 33 : 17;
  const any = Math.round((Number.isFinite(q.prior) ? q.prior : 0) * 100);
  return `Начальный шанс: на одном кубике нужная цифра с шансом ${one} (около ${pct} %)${jokers ? ', потому что единицы — джокеры' : ''}. ` +
    `Хотя бы на одном из ${q.size} кубиков игрока: около ${any} %. Ставка и ход торгов могут сдвинуть эту оценку.`;
}

/** Ответ на вопрос: 'yes' — в руке автора есть нужная цифра, 'no' — нет. */
export const ANSWERS = Object.freeze(['yes', 'no']);
const ANSWER_WORD = { yes: 'Да', no: 'Нет' };

/**
 * Проверка ответов по рукам вскрытия.
 * @param {object} round тот же раунд, из которого собрано задание
 * @param {object} task результат buildReadTask
 * @param {Object<number,'yes'|'no'>} answers номер ставки → ответ на «есть ли в руке автора нужная цифра»
 * @returns {{items: object[], good: number, guessGood: number, total: number, lines: string[], outcome: string}|null}
 *   null, если ответы неполные или неверные.
 *   item.ok — ответ совпал с рукой; item.guessOk — совпала бы догадка «по начальному шансу»
 *   (да, если шанс цифры у такого числа кубиков не ниже половины)
 */
export function checkReadAnswers(round, task, answers) {
  if (!round || !task || task.id !== round.id || !answers || typeof answers !== 'object') return null;
  const items = [];
  for (const qn of task.questions) {
    const answer = answers[qn.n];
    if (!ANSWERS.includes(answer)) return null;
    const hand = round.hands[qn.seat] || [];
    const matches = hand.filter((d) => dieMatches(d, qn.f, round.wild)).length;
    const has = matches > 0;
    const guess = qn.prior >= 0.5 ? 'yes' : 'no';
    const text = saidText({ q: qn.q, f: qn.f, matches, size: hand.length });
    items.push({
      n: qn.n, seat: qn.seat, q: qn.q, f: qn.f, answer, truth: has ? 'has' : 'none', has,
      ok: (answer === 'yes') === has, guess, guessOk: (guess === 'yes') === has,
      matches, size: hand.length, prior: qn.prior, text,
    });
  }
  const good = items.filter((i) => i.ok).length;
  const guessGood = items.filter((i) => i.guessOk).length;
  const lines = [];
  for (const it of items) {
    const chance = `${Math.round(it.prior * 100)} %`;
    lines.push(`Ставка ${it.n}: ${it.text}. Вы ответили «${ANSWER_WORD[it.answer]}»: ${it.ok ? 'верно' : 'неверно'}. ` +
      `Без других сведений шанс, что среди ${it.size} ${plural(it.size, 'кубика', 'кубиков', 'кубиков')} есть нужная цифра, около ${chance}.`);
  }
  if (items.some((i) => i.truth === 'none')) {
    lines.push('Если нужной цифры в руке автора не было, это ещё не блеф: ставка могла опираться на кубики других игроков.');
  }
  const last = round.bids[round.bids.length - 1];
  const e = round.end;
  const head = e.kind === 'calza' ? `Calza на ${last.q}×${last.f}` : `Проверка ставки ${last.q}×${last.f}`;
  const verdict = e.kind === 'calza' ? (e.ok ? 'точно' : 'мимо') : (e.ok ? 'ставка верна' : 'ставка ложна');
  const outcome = `${head}: на столе ${e.actual}, ${verdict}.`;
  return { items, good, guessGood, total: items.length, lines, outcome };
}

/** Минимум ответов за сеанс, после которого серия сравнивается с догадкой по числу кубиков у автора. */
export const MIN_SERIES = 10;

/**
 * Серия ответов за сеанс (в хранилище не пишется).
 * @param {{n:number, good:number, guess:number}|null} series предыдущая серия
 * @param {{good:number, guessGood:number, total:number}} res результат checkReadAnswers
 */
export function addSeries(series, res) {
  const s = series && Number.isInteger(series.n) ? series : { n: 0, good: 0, guess: 0 };
  if (!res || !Number.isInteger(res.total) || res.total < 1) return { ...s };
  return { n: s.n + res.total, good: s.good + res.good, guess: s.guess + res.guessGood };
}

/** Разница в ответах, меньше которой серия не считается лучше или хуже догадки (как в «Читай стол»). */
export const SURE_GAP = 3;

/** Строки оценки серии: сколько угадано и как это соотносится с догадкой только по числу кубиков у автора. */
export function seriesLines(series, { min = MIN_SERIES } = {}) {
  if (!series || !Number.isInteger(series.n) || series.n < 1) return [];
  const lines = [
    `Угадано за сеанс: ${series.good} из ${series.n}.`,
    `Если отвечать только по числу кубиков у автора, без чтения ставок, угадали бы ${series.guess} из ${series.n}.`,
  ];
  const gain = series.good - series.guess;
  if (series.n < min) {
    lines.push(`Серия короткая: выводы после ${min} ответов.`);
  } else if (gain >= SURE_GAP) {
    lines.push(`Вы читаете ставки лучше: на ${gain} ${gain < 5 ? 'ответа' : 'ответов'} больше.`);
  } else if (gain <= -SURE_GAP) {
    lines.push('Пока догадка по числу кубиков угадывает чаще. Обратите внимание на то, повышал ли автор цифру и сколько у него кубиков.');
  } else {
    lines.push('Разница с догадкой мала, судить рано: сыграйте ещё несколько раундов.');
  }
  return lines;
}

/**
 * Копия счётчиков по темам с учтённым результатом упражнения (тема «read»: n — ответов, good — верных).
 * @param {object} byTag текущие счётчики (мусор заменяется пустым объектом)
 * @param {{good: number, total: number}} res результат checkReadAnswers
 */
export function addReadResult(byTag, res) {
  const src = byTag && typeof byTag === 'object' && !Array.isArray(byTag) ? byTag : {};
  const total = Number.isInteger(res?.total) && res.total > 0 ? res.total : 0;
  const good = Number.isInteger(res?.good) ? Math.max(0, Math.min(res.good, total)) : 0;
  if (!total) return { ...src };
  const old = src.read && Number.isInteger(src.read.n) && Number.isInteger(src.read.good) ? src.read : { n: 0, good: 0 };
  return { ...src, read: { n: old.n + total, good: old.good + good } };
}
