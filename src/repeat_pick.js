// repeat_pick.js — выбор повтора для тренажёра с паузой между показами одной ситуации.
//
// Чистый модуль. Ситуацию, которую только что показали, не показываем снова, пока
// не пройдёт ещё gap других ситуаций: иначе повтор проверяет кратковременную память,
// а не умение оценить шанс. Память о показах живёт в странице (Map), в хранилище не пишется.

/** Сколько других ситуаций должно пройти между двумя показами одной и той же. */
export const REPEAT_GAP = 3;
/** Шанс взять повтор, когда есть подходящие. */
export const REPEAT_CHANCE = 0.4;

/** Ключ ситуации: одинаков у записей очереди, перечитанных из хранилища. */
export function situationKey(item) {
  return `${item.mode}|${item.n}|${item.q}|${item.f}|${item.h.join('')}`;
}

/**
 * Повторы, которые можно показать сейчас.
 * @param {object[]} pool ситуации очереди в нужном режиме
 * @param {Map<string, number>} seenAt ключ → номер показа, когда ситуацию видели в последний раз
 * @param {number} counter номер текущего показа (растёт на 1 с каждой ситуацией)
 */
export function eligibleRepeats(pool, seenAt, counter, gap = REPEAT_GAP) {
  return pool.filter((it) => {
    const at = seenAt.get(situationKey(it));
    return at === undefined || counter - at > gap;
  });
}

/**
 * Повтор или null (тогда нужна новая ситуация).
 * @param {() => number} rnd источник случайных чисел [0,1)
 */
export function pickRepeat(pool, seenAt, counter, { gap = REPEAT_GAP, chance = REPEAT_CHANCE, rnd = Math.random } = {}) {
  const ok = eligibleRepeats(pool, seenAt, counter, gap);
  if (!ok.length || !(rnd() < chance)) return null;
  return ok[Math.floor(rnd() * ok.length)];
}
