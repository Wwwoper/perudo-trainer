// src/ui/decisions.js — запись решений игрока в партии.
//
// Для каждого решения (повышение, «Не верю», Calza):
//  - в профиль добавляется счётчик по меткам (byTag: { метка: { n, good } }) — из него потом
//    складывается блок «Над чем поработать» в статистике;
//  - решение запоминается в памяти партии, а когда партия закончена, из них отбираются
//    ключевые моменты (до трёх) и сохраняются в хранилище.
// Здесь только запись: правила игры и подсказки она не меняет.

import { getMoments, setMoments, updateStats } from '../storage.js';
import { buildMoment, pickKeyMoments, appendMoments } from '../moments.js';

let gameId = '';
let seq = 0;
let moments = [];

/** Начало новой партии: решения прошлой партии забываются (сохранены ключевые моменты, если она была дойдена до конца). */
export function startDecisionLog(id) {
  gameId = String(id ?? '');
  seq = 0;
  moments = [];
}

/**
 * Записывает решение и обновляет счётчики. Возвращает момент или null, если данные непригодны.
 * @param {{round:number, kind:string, total:number, hand:number[], bid:?{q:number,f:number},
 *          played?:?{q:number,f:number}, palifico?:boolean, p:number, code:string}} d
 */
export function recordDecision(d) {
  const m = buildMoment({
    id: `${gameId}-${seq + 1}`, ts: Date.now(),
    round: d.round, kind: d.kind, total: d.total, hand: Array.isArray(d.hand) ? d.hand.slice() : d.hand,
    bid: d.bid ?? null, played: d.played ?? null, palifico: !!d.palifico, p: d.p, code: d.code,
  });
  if (!m) return null;
  seq += 1;
  moments.push(m);
  updateStats((S) => {
    S.byTag = S.byTag && typeof S.byTag === 'object' ? S.byTag : {};
    for (const tag of m.tags) {
      const b = S.byTag[tag] = S.byTag[tag] || { n: 0, good: 0 };
      b.n += 1;
      if (m.code === 'good') b.good += 1;
    }
  });
  return m;
}

/**
 * Раунд закончился вскрытием: если вы потеряли кубик, все ваши решения этого раунда
 * помечаются (round — номер раунда до действия, после него движок уже начинает следующий).
 */
export function markRoundOutcome(events, round, humanId = 'human') {
  const lost = (events || []).some((e) => e.type === 'PLAYER_LOST_DIE' && e.playerId === humanId);
  if (!lost) return;
  for (const m of moments) if (m.round === round) m.lostDie = true;
}

/** Партия закончена: до трёх ключевых моментов сохраняются в хранилище. Возвращает сохранённые. */
export function saveKeyMoments() {
  const picked = pickKeyMoments(moments);
  if (picked.length) setMoments(appendMoments(getMoments(), picked));
  return picked;
}

/** Решения текущей партии (копия) — для проверок и для итога партии. */
export function currentDecisions() {
  return moments.map((m) => ({ ...m, h: m.h.slice(), tags: m.tags.slice() }));
}
