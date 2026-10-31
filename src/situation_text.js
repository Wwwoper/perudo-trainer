// situation_text.js — тексты для описания ситуации (situation.js): строки с типом и честными оговорками.
//
// Модуль чистый. Каждая строка — { id, type, text, evidence?, n?, fewData? }:
//   type 'fact'       — известно точно (ваши кубики, число кубиков за столом, ставки раунда);
//   type 'estimate'   — следует из расчёта или из измерений на наших ботах (evidence указывает на таблицу);
//   type 'hypothesis' — предположение по наблюдениям; несёт число наблюдений, при малой выборке — «мало данных».
// Рекомендаций «что сделать» здесь нет: они появятся только по кнопке «Подсказка плана».
// Чужих рук модуль не видит. Числа из измерений берутся из реестра EVIDENCE, который сверяется
// с docs/dev/strategy-evidence.md тестом, поэтому цифра в тексте всегда есть в документе.

import { AssistMode } from './assist.js';

export const LINE_TYPES = ['fact', 'estimate', 'hypothesis'];
export const DEPTHS = ['short', 'detailed'];
/** Меньше стольких наблюдений за соперником — «мало данных». */
export const OBS_MIN = 3;
/** Если разрыв между нужным числом кубиков и ожиданием не больше этого, ставку считаем «около среднего». */
export const GAP_NEAR = 0.5;

/**
 * Утверждения, у которых есть цифры из измерений. section — номер раздела в docs/dev/strategy-evidence.md,
 * rows — строка таблицы → число (в процентах). Тест сверяет реестр с документом.
 */
export const EVIDENCE = Object.freeze({
  jump: Object.freeze({
    section: 3,
    rows: Object.freeze({ '+1': 80, '+2 и больше': 57 }),
  }),
});

/** Формулировки, которых в текстах быть не должно: уверенность, которой у нас нет, и прямые советы. */
export const BANNED = [
  /точно блефу/i, /всегда/i, /никогда/i, /гарантир/i, /обязательно/i, /наверняка/i, /непременно/i,
  /стопроцентн/i, /без сомнени/i, /доказан/i,
  /вам\s+(надо|нужно|следует|стоит|лучше)\s+(поставить|проверить|сказать|верить|не верить)/i,
  /лучше\s+(сказать|поставить|проверить|поверить)/i,
  /верьте/i,
];

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const dice = (n) => `${n} ${plural(n, 'кубик', 'кубика', 'кубиков')}`;
const num1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const frac = (p) => (p === 1 / 3 ? '1/3' : p === 1 / 6 ? '1/6' : num1(p));

function line(id, type, text, extra = {}) {
  return { id, type, text, ...extra };
}

/** Имя игрока по id: из names, иначе сам id. */
function nameOf(names, id) {
  return (names && typeof names[id] === 'string' && names[id]) || id;
}

/**
 * Строки описания ситуации.
 * @param {object} sit результат describeSituation
 * @param {{depth?: 'short'|'detailed', names?: Record<string,string>}} [opts]
 * @returns {{id:string, type:string, text:string, evidence?:string, n?:number, fewData?:boolean}[]}
 */
export function situationLines(sit, { depth = 'short', names = {} } = {}) {
  const d = DEPTHS.includes(depth) ? depth : 'short';
  const out = [];
  const nm = (seat) => {
    const p = sit.balance.players.find((x) => x.seat === seat);
    return p ? nameOf(names, p.id) : '';
  };

  // Фаза
  const total = sit.balance.total;
  const phaseText = {
    start: `Начало партии: на столе ${dice(total)}.`,
    mid: `Середина партии: на столе ${dice(total)}.`,
    endgame: `Эндшпиль: на столе ${dice(total)}, каждый кубик на счету.`,
    palifico: `Палифико: единицы не джокеры, шанс одной цифры на кубике — 1/6. На столе ${dice(total)}.`,
  }[sit.phase];
  out.push(line('phase', 'fact', phaseText));

  // Баланс
  const me = sit.balance.players.find((p) => p.isMe);
  const lastDice = sit.balance.lastDice.filter((s) => s !== me?.seat);
  if (lastDice.length) {
    out.push(line('last_dice', 'fact', `Последний кубик у: ${lastDice.map(nm).join(', ')}.`));
  }
  if (d === 'detailed') {
    const rows = sit.balance.players.filter((p) => !p.isMe).map((p) => `${nameOf(names, p.id)} — ${p.dice}`);
    out.push(line('balance', 'fact', `У вас ${dice(me ? me.dice : 0)}. У соперников: ${rows.join('; ')}.`));
    if (me && sit.balance.leaders.length === 1 && sit.balance.leaders[0] !== me.seat) {
      out.push(line('leader', 'fact', `Больше всех кубиков у ${nm(sit.balance.leaders[0])}.`));
    }
  }

  // Ожидание
  const e = sit.facts.find((f) => f.kind === 'expectation');
  if (e) {
    out.push(line('expectation', 'fact',
      `Ставка ${e.q}×${e.f}: у вас подходит ${e.own}, ещё не хватает ${e.need}. Среди ${e.hidden} чужих кубиков в среднем ${num1(e.expected)} нужной цифры (шанс одного кубика ${frac(e.p)}).`));
    const verdict = Math.abs(e.gap) <= GAP_NEAR ? 'около среднего'
      : e.gap > 0 ? 'выше среднего' : 'ниже среднего';
    out.push(line('gap', 'estimate', `По расчёту нужное число кубиков у соперников ${verdict} (разница ${num1(Math.abs(e.gap))}).`));
  }

  const read = sit.facts.find((f) => f.kind === 'table_read');
  if (read && d === 'detailed' && Math.abs(read.pRead - read.p) >= 0.005) {
    const pct = (x) => `${Math.round(x * 100)} %`;
    out.push(line('table_read', 'estimate', `Шанс по вашим кубикам ${pct(read.p)}; с учётом ставок за столом ${pct(read.pRead)}.`));
  }

  // Динамика ставок
  const trend = sit.facts.find((f) => f.kind === 'bid_trend');
  if (trend && trend.steps.length && d === 'detailed') {
    out.push(line('bid_trend', 'fact',
      `За этот раунд ставка поднималась ${trend.steps.length} ${plural(trend.steps.length, 'раз', 'раза', 'раз')}: прыжков на 2 и больше — ${trend.jumps}, смен цифры — ${trend.faceChanges}.`));
    if (trend.last && trend.last.dq >= 2) {
      const ev = EVIDENCE.jump;
      out.push(line('jump_evidence', 'estimate',
        `Против наших ботов ставки после прыжка на 2 и больше оказывались верными реже: ${ev.rows['+2 и больше']} % против ${ev.rows['+1']} % при шаге +1. Люди могут ходить иначе.`,
        { evidence: 'jump' }));
    }
  }

  // Наблюдения за соперниками
  for (const o of sit.observations.players) {
    const who = nameOf(names, o.id);
    if (o.silent) {
      if (d === 'detailed') out.push(line(`silent:${o.id}`, 'fact', `${who} в этом раунде ещё не ставил.`));
      continue;
    }
    const faces = Object.entries(o.faces).map(([f, k]) => (k > 1 ? `${f} (${k} раза)` : `${f}`)).join(', ');
    const few = o.bids < OBS_MIN;
    out.push(line(`obs:${o.id}`, 'hypothesis',
      `${who} называл: ${faces}. Возможно, эти цифры есть у него на руках, но это предположение (наблюдений: ${o.bids}${few ? ', мало данных' : ''}).`,
      { n: o.bids, fewData: few }));
  }

  // Последствия вариантов
  const dudo = sit.options.find((o) => o.type === 'dudo');
  const raise = sit.options.find((o) => o.consequence === 'passes');
  if (dudo) out.push(line('after_dudo', 'fact', 'Проверка завершит раунд сейчас: кубики откроются, кто-то потеряет кубик.'));
  if (raise) out.push(line('after_raise', 'fact', `Повышение передаст решение игроку ${nm(raise.passesTo)}.`));

  return out;
}

/** Можно ли показывать пояснения: в режиме «Игра» — только когда партия закончена. */
export function canExplain({ mode, finished = false } = {}) {
  return mode !== AssistMode.GAME || finished === true;
}

/**
 * Строки «до хода» с учётом режима: в режиме «Игра» до конца партии возвращает null.
 * @returns {object[]|null}
 */
export function beforeMoveLines(sit, { mode, finished = false, depth, names } = {}) {
  if (!canExplain({ mode, finished })) return null;
  return situationLines(sit, { depth, names });
}

const pct = (x) => `${Math.round(x * 100)} %`;
const bidText = (o) => `${o.q}×${o.f}`;

/**
 * «Подсказка плана»: варианты хода с шансами и нейтральный вывод по расчёту. Показывается только по кнопке.
 * Без приказов: это сравнение шансов по вашим кубикам, а не совет, как играть против живых людей.
 * @param {object} sit результат describeSituation
 * @param {{threshold?: number}} [opts]
 * @returns {{id:string, type:string, text:string}[]}
 */
export function planLines(sit, { threshold = 0.5 } = {}) {
  const out = [];
  const thr = Number.isFinite(threshold) ? threshold : 0.5;
  const dudo = sit.options.find((o) => o.type === 'dudo');
  const min = sit.options.find((o) => o.type === 'minRaise');
  const safe = sit.options.find((o) => o.type === 'safeRaise') || (min && min.isBestSafe ? min : null);

  if (dudo) {
    out.push(line('plan_dudo', 'estimate',
      `Проверка: ставка соперника верна с шансом ${pct(dudo.p)}, проверка сработает с шансом ${pct(dudo.success)}.`));
  }
  if (min) {
    out.push(line('plan_min', 'estimate', `Минимальное повышение ${bidText(min)}: верно с шансом ${pct(min.p)}.`));
  }
  if (safe && safe !== min) {
    out.push(line('plan_safe', 'estimate', `Самая сильная ставка с шансом не ниже ${pct(thr)}: ${bidText(safe)} (${pct(safe.p)}).`));
  }
  if (dudo) {
    out.push(line('plan_verdict', 'estimate', dudo.meetsThreshold
      ? `По расчёту ставка соперника верна реже порога ${pct(thr)}, поэтому проверка срабатывает чаще, чем нет.`
      : `По расчёту ставка соперника верна не реже порога ${pct(thr)}, поэтому проверка срабатывает реже, чем нет.`));
  } else if (min && !min.meetsThreshold && !safe) {
    out.push(line('plan_verdict', 'estimate', `По расчёту допустимые ставки ниже порога ${pct(thr)}: любая ставка здесь рискованна.`));
  }
  if (out.length) out.push(line('plan_note', 'fact', 'Это расчёт по вашим кубикам: чужие кубики он не знает, а соперники могут ходить по-своему.'));
  return out;
}

const ACTION_TYPES = ['raise', 'dudo', 'calza'];

/**
 * Комментарий к вашему ходу, написанный до вскрытия: смысл выбора и ближайшая альтернатива.
 * Ничего не говорит о том, блефовал ли соперник: итог ещё неизвестен, а чужие кубики описание не знает.
 * @param {object} sit описание ситуации ДО хода (describeSituation)
 * @param {{type: 'raise'|'dudo'|'calza', q?: number, f?: number}} action выбранное действие
 * @param {{p?: number, depth?: 'short'|'detailed'}} [opts] p — шанс выбранного хода (как в оценке «Разбора»)
 * @returns {{id:string, type:string, text:string}[]}
 */
export function explainAction(sit, action, { p, depth = 'short' } = {}) {
  if (!sit || !action || !ACTION_TYPES.includes(action.type)) return [];
  const d = DEPTHS.includes(depth) ? depth : 'short';
  const out = [];
  const hand = sit.facts.find((f) => f.kind === 'hand');
  const exp = sit.facts.find((f) => f.kind === 'expectation');
  const wild = sit.phase !== 'palifico';
  const chance = Number.isFinite(p) ? ` По расчёту шанс ${pct(p)}.` : '';
  const dudo = sit.options.find((o) => o.type === 'dudo');
  const min = sit.options.find((o) => o.type === 'minRaise');

  if (action.type === 'raise') {
    if (!Number.isInteger(action.q) || !Number.isInteger(action.f) || !hand) return [];
    const own = hand.counts[action.f] + (wild && action.f !== 1 ? hand.counts[1] : 0);
    const hidden = sit.balance.total - hand.size;
    const share = action.f !== 1 && wild ? 1 / 3 : 1 / 6;
    const need = Math.max(0, action.q - own);
    out.push(line('act_summary', 'fact', own > 0
      ? `Вы поставили ${action.q}×${action.f}: в вашей руке подходит ${own}, ещё нужно найти ${need} у соперников.`
      : `Вы поставили ${action.q}×${action.f}: в вашей руке подходящих кубиков нет, ставка держится на кубиках соперников (нужно ${need}).`));
    if (d === 'detailed') {
      out.push(line('act_expect', 'estimate', `Среди ${hidden} чужих кубиков в среднем ${num1(hidden * share)} нужной цифры.${chance}`));
    } else if (chance) {
      out.push(line('act_chance', 'estimate', chance.trim()));
    }
    if (dudo) out.push(line('act_alt', 'estimate', `Для сравнения: проверка в этот момент срабатывала бы с шансом ${pct(dudo.success)}.`));
  } else if (action.type === 'dudo') {
    const bid = exp ? `${exp.q}×${exp.face}` : 'ставке';
    out.push(line('act_summary', 'fact', exp
      ? `Вы не поверили ${bid}: по вашим кубикам не хватало ещё ${exp.need}, среди ${exp.hidden} чужих кубиков в среднем ${num1(exp.expected)} нужной цифры.`
      : 'Вы не поверили ставке.'));
    if (dudo) out.push(line('act_chance', 'estimate', `Ставка верна с шансом ${pct(dudo.p)}, проверка сработает с шансом ${pct(dudo.success)}.`));
    if (min && d === 'detailed') out.push(line('act_alt', 'estimate', `Для сравнения: минимальное повышение ${min.q}×${min.f} верно с шансом ${pct(min.p)}.`));
  } else {
    out.push(line('act_summary', 'fact', exp
      ? `Вы сказали Calza на ${exp.q}×${exp.face}: ставка должна оказаться точной.`
      : 'Вы сказали Calza.'));
    if (Number.isFinite(p)) out.push(line('act_chance', 'estimate', `Шанс точного совпадения по расчёту ${pct(p)}: это узкое событие, оно бывает заметно реже, чем «ставка верна».`));
    if (dudo && d === 'detailed') out.push(line('act_alt', 'estimate', `Для сравнения: проверка сработала бы с шансом ${pct(dudo.success)}.`));
  }
  return out;
}
