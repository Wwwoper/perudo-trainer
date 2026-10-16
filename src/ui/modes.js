// src/ui/modes.js — режимы тренажёра и подбор безопасной ставки.

import { bestSafeRaise as bestSafe } from '../compare.js';
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

/** Самая сильная безопасная ставка: логика в compare.js, вероятности — из core.js. */
export function bestSafeRaise(bid, n, hand, rules, thr) {
  return bestSafe(bid, n, hand, rules, thr, P.probBid);
}
