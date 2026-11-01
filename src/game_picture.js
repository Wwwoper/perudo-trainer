// game_picture.js — «Картина партии» для итога: кубики по раундам и несколько фактов, которые можно вычислить.
//
// Чистый модуль. Источник — раунды партии (rounds.js, с ids): кубики каждого игрока в начале раунда и итог вскрытия.
// Тексты — только то, что считается по этим данным; оценок манеры игры здесь нет.

import { sanitizeRound } from './rounds.js';

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Раунды одной партии по порядку, только с ids и вашим местом (остальные для картины не годятся). */
export function gameRounds(rounds, gameId) {
  const prefix = `${String(gameId ?? '')}-r`;
  return (Array.isArray(rounds) ? rounds : [])
    .filter((r) => typeof r?.id === 'string' && r.id.startsWith(prefix))
    .map(sanitizeRound)
    .filter((r) => r && r.ids && r.me >= 0)
    .sort((a, b) => a.round - b.round);
}

/** Место, потерявшее кубик в раунде, или -1 (Calza попала точно). */
export function roundLoser(r) {
  if (r.end.kind === 'calza') return r.end.ok ? -1 : r.end.by;
  return r.end.ok ? r.end.by : r.end.bidder;
}

/**
 * Кубики по раундам: точка на начало каждого раунда и, если известно, итоговая точка.
 * @param {object[]} rs результат gameRounds
 * @param {Object<string, number>|null} finalDice id → кубиков после последнего раунда
 * @returns {{labels: string[], series: {id: string, isMe: boolean, values: number[]}[], max: number}|null}
 */
export function diceByRound(rs, finalDice = null) {
  if (!Array.isArray(rs) || !rs.length) return null;
  const meId = rs[0].ids[rs[0].me];
  const order = [];
  for (const r of rs) for (const id of r.ids) if (!order.includes(id)) order.push(id);
  const hasFinal = finalDice && typeof finalDice === 'object';
  const labels = rs.map((r) => String(r.round));
  if (hasFinal) labels.push('итог');
  const series = order.map((id) => ({
    id, isMe: id === meId,
    values: rs.map((r) => { const s = r.ids.indexOf(id); return s < 0 ? 0 : r.dice[s]; }),
  }));
  if (hasFinal) for (const s of series) s.values.push(Number.isInteger(finalDice[s.id]) && finalDice[s.id] >= 0 ? finalDice[s.id] : 0);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return { labels, series, max };
}

/**
 * Факты партии из раундов.
 * @param {{rounds: object[], finalDice?: object, names?: Object<string,string>, entryFor?: (round:number)=>object|null}} s
 *   entryFor — запись «Разбора» по номеру раунда: { kind, prob } (необязательно)
 * @returns {{id: string, type: 'fact', text: string}[]}
 */
export function pictureLines({ rounds, finalDice = null, names = {}, entryFor = null } = {}) {
  const chart = diceByRound(rounds, finalDice);
  if (!chart) return [];
  const me = chart.series.find((s) => s.isMe);
  const nm = (id) => String(names[id] ?? id);
  const out = [];
  const total = rounds.length;

  // 1) Сколько раундов вы потеряли кубик
  const lost = rounds.filter((r) => roundLoser(r) === r.me).length;
  out.push({
    id: 'losses', type: 'fact',
    text: lost
      ? `Вскрытий в партии: ${total}. Кубик вы потеряли в ${lost} из них.`
      : `Вскрытий в партии: ${total}. Кубик вы не потеряли ни разу.`,
  });

  // 2) Переломный раунд: больше всего упала доля ваших кубиков на столе
  let best = null;
  rounds.forEach((r, i) => {
    if (roundLoser(r) !== r.me) return;
    const sumAt = (k) => chart.series.reduce((a, s) => a + s.values[k], 0);
    const before = me.values[i] / sumAt(i);
    const after = i + 1 < me.values.length && sumAt(i + 1) > 0 ? me.values[i + 1] / sumAt(i + 1) : null;
    if (after === null) return;
    const drop = before - after;
    if (drop > 0 && (!best || drop > best.drop)) best = { r, i, before, after, drop };
  });
  if (best) {
    const e = typeof entryFor === 'function' ? entryFor(best.r.round) : null;
    const pc = (x) => `${Math.round(x * 100)} %`;
    let how = '';
    if (e && Number.isFinite(e.prob)) {
      if (e.kind === 'dudo') how = `, проверив ставку, которая по расчёту была верна с шансом ${pc(e.prob)}`;
      else if (e.kind === 'raise') how = `, поставив со своим шансом ${pc(e.prob)}`;
      else if (e.kind === 'calza') how = `, сказав Calza с шансом ${pc(e.prob)}`;
    }
    out.push({
      id: 'turning', type: 'fact',
      text: `Больше всего вашу долю на столе уменьшил раунд ${best.r.round}: вы потеряли кубик${how}. Доля ваших кубиков упала с ${pc(best.before)} до ${pc(best.after)}.`,
    });
  }

  // 3) Кто чаще всех лидировал по числу кубиков (на начало раундов)
  const points = rounds.length;
  const led = new Map();
  for (let i = 0; i < points; i++) {
    const vals = chart.series.map((s) => s.values[i]);
    const mx = Math.max(...vals);
    const who = chart.series.filter((s) => s.values[i] === mx);
    if (who.length === 1) led.set(who[0].id, (led.get(who[0].id) || 0) + 1);
  }
  const top = [...led.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const who = top[0] === me.id ? 'у вас' : `у игрока ${nm(top[0])}`;
    out.push({
      id: 'leader', type: 'fact',
      text: `Больше всего кубиков в начале раунда чаще всего было ${who}: в ${top[1]} из ${points} ${plural(points, 'раунда', 'раундов', 'раундов')}.`,
    });
  }
  return out;
}
