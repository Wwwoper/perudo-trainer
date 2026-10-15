// src/ui/modes.js — режимы тренажёра и подбор безопасной ставки.

import { legal } from '../rules.js';
import { P } from './common.js';

export const MODES = {
  classic: {
    name: 'Классика (5 кубиков у вас)', wild: true, n: [10, 20], k: () => 5, bluff: 0.25,
    d: 'Единицы — джокеры. Среднее количество кубиков.'
  },
  nowild: {
    name: 'Без джокеров / Палифико', wild: false, n: [10, 20], k: () => 5, bluff: 0.25,
    d: 'Все цифры имеют шанс 1/6. Ставки заметно меньше.'
  },
  endgame: {
    name: 'Эндшпиль (3–6 кубиков всего)', wild: true, n: [3, 6], k: (n) => P.ri(1, Math.ceil(n / 2)), bluff: 0.3,
    d: 'Почти дуэль: ваши кубики решают многое.'
  },
  big: {
    name: 'Большой стол (25–40 кубиков)', wild: true, n: [25, 40], k: () => 5, bluff: 0.2,
    d: 'Много неизвестных: работает «среднее ожидание».'
  },
  bluffer: {
    name: 'Блефующий соперник', wild: true, n: [10, 20], k: () => 5, bluff: 0.7,
    d: 'Соперник часто завышает ставку — проверяйте на «Не верю».'
  },
  solo: {
    name: 'Мало кубиков у вас (1–2)', wild: true, n: [8, 16], k: () => P.ri(1, 2), bluff: 0.3,
    d: 'Вы почти не знаете свою руку — полагайтесь на вероятность.'
  },
};

/** Короткое название режима тренажёра: «Классика» из «Классика (5 кубиков у вас)». */
export function modeLabel(key) {
  const m = MODES[key];
  return m ? m.name.split('(')[0].trim() : String(key);
}

/* Локальный bestSafeRaise — раньше жил в core.js.
   Теперь используем rules.legal + P.probBid, чтобы не дублировать
   логику в двух местах. */
export function bestSafeRaise(bid, n, hand, rules, thr) {
  thr = thr == null ? 0.5 : thr;
  const wild = !rules || rules.wild !== false;
  let best = null;
  for (let q = 1; q <= n; q++) for (let f = 1; f <= 6; f++) {
    if (!legal(q, f, bid, rules)) continue;
    const p = P.probBid(q, f, n, hand, wild);
    if (p >= thr && (!best || q > best.q || (q === best.q && p > best.p))) {
      best = { q, f, p };
    }
  }
  return best;
}
