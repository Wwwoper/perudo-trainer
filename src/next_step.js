// src/next_step.js — блок «Что дальше» в «Статистике»: одна рекомендация по уже накопленным данным ← чистая логика (без DOM).
// Новых данных не собирает: берёт профиль, историю партий и очередь повторов.

import { weakSpots } from './weak_spots.js';
import { MIN_GAMES_FOR_RATE, summarize } from './stats_summary.js';

export const NEXT_TITLE = 'Что дальше';

/**
 * Рекомендация одна, по порядку важности:
 *  1. есть очередь повторов — решить её в Тренажёре;
 *  2. есть слабая тема — потренировать её (если у темы есть режим) или открыть Тренажёр;
 *  3. сыграно меньше партий, чем нужно для процента побед — сыграть ещё;
 *  4. «Читай вскрытие» ещё не пробовали — открыть упражнения;
 *  5. иначе — сыграть партию.
 * @param {{stats?: object, games?: any[], queue?: any[]}} src
 * @returns {{id: string, text: string, action: {label: string, tab?: string, train?: string}}}
 */
export function nextStep({ stats, games, queue } = {}) {
  const sum = summarize({ stats, games, queue });
  if (sum.queue > 0) {
    return {
      id: 'queue',
      text: `В очереди повторов ситуаций: ${sum.queue}. Решите их в Тренажёре: каждая уйдёт после двух успешных повторов подряд.`,
      action: { label: 'Открыть Тренажёр', tab: 'train' },
    };
  }
  const { weak } = weakSpots(stats?.byTag);
  if (weak.length) {
    const w = weak[0];
    return {
      id: 'weak',
      text: `Больше всего ошибок в теме «${w.label}». Потренируйтесь на ней.`,
      action: w.mode ? { label: 'Тренировать', train: w.mode } : { label: 'Открыть Тренажёр', tab: 'train' },
    };
  }
  if (sum.games.total < MIN_GAMES_FOR_RATE) {
    const left = MIN_GAMES_FOR_RATE - sum.games.total;
    return {
      id: 'games',
      text: sum.games.total === 0
        ? `Сыграйте партию: после ${MIN_GAMES_FOR_RATE} партий появится процент побед.`
        : `Сыграйте ещё партий: ${left}. После ${MIN_GAMES_FOR_RATE} партий появится процент побед.`,
      action: { label: 'Играть', tab: 'game' },
    };
  }
  const read = stats?.byTag?.read;
  if (!read || !Number.isInteger(read.n) || read.n === 0) {
    return {
      id: 'read',
      text: 'Попробуйте упражнение «Читай вскрытие»: оно учит замечать, какие цифры называли соперники.',
      action: { label: 'Открыть Упражнения', tab: 'drill' },
    };
  }
  return {
    id: 'play',
    text: 'Хороший темп. Сыграйте ещё партию и сравните результаты.',
    action: { label: 'Играть', tab: 'game' },
  };
}
