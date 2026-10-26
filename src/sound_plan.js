// sound_plan.js — правила звуков: что и когда звучит в зависимости от события, темпа и режима.
//
// Модуль чистый: не знает ни о браузере, ни о Web Audio, ни о таймерах. Время ему передаёт вызывающий
// (now, миллисекунды), а сам звук воспроизводит другой модуль по тому, что вернёт planner.plan().
//
// Идея: звук привязан к событию игры, а не ко времени, поэтому сам подстраивается под темп.
// На быстром темпе боты ходят каждые 0,32 с, и звук на каждую ставку превратился бы в очередь щелчков,
// поэтому там звучат только важные события; на обычном и медленном играет всё.

import { BOT_SPEEDS } from './game_settings.js';

export const SOUND_MODES = Object.freeze(['off', 'quiet', 'normal']);
export const DEFAULT_SOUND_MODE = 'off';

/** Громкость (0…1) по режиму. */
export const MODE_VOLUME = Object.freeze({ quiet: 0.35, normal: 0.7 });

/**
 * События игры и их звуки.
 *   dur      — сколько звучит, мс (звуки короткие, чтобы не накладываться на быстром темпе);
 *   priority — 3: важное, звучит всегда (ждёт своей очереди); 2: заметное; 1: фоновое (пропускается, если занято).
 */
export const CUES = Object.freeze({
  turn:    { sound: 'turn',  dur: 160, priority: 3 },   // ваш ход
  dudo:    { sound: 'dudo',  dur: 220, priority: 3 },   // «Не верю!»
  calza:   { sound: 'calza', dur: 220, priority: 3 },   // Calza
  loseDie: { sound: 'lose-die', dur: 260, priority: 3 }, // кто-то потерял кубик
  win:     { sound: 'win',   dur: 900, priority: 3 },   // вы выиграли партию
  lose:    { sound: 'lose',  dur: 900, priority: 3 },   // вы проиграли партию
  deal:    { sound: 'deal',  dur: 140, priority: 2 },   // раздача кубиков в новом раунде
  illegal: { sound: 'illegal', dur: 120, priority: 2 }, // недопустимая ставка
  bidYou:  { sound: 'bid',   dur: 70,  priority: 1 },   // ваша ставка
  bidBot:  { sound: 'bid-bot', dur: 70, priority: 1 },  // ставка бота
});

export const EVENTS = Object.freeze(Object.keys(CUES));

/** Какие события звучат при каждом темпе. Ваши действия (ставка, ошибка) отвечают на ваш клик и звучат всегда. */
const ALWAYS = ['turn', 'dudo', 'calza', 'loseDie', 'win', 'lose', 'illegal', 'bidYou'];
export const AUDIBLE = Object.freeze({
  fast:   Object.freeze([...ALWAYS]),
  step:   Object.freeze([...ALWAYS, 'deal', 'bidBot']),
  normal: Object.freeze([...ALWAYS, 'deal', 'bidBot']),
  slow:   Object.freeze([...ALWAYS, 'deal', 'bidBot']),
});

/** Ставки ботов на «пошаговом» темпе тише: они идут часто. */
const BOT_BID_STEP_GAIN = 0.6;

/** Важное событие ждёт окончания предыдущего звука, но не дольше этого (иначе звук отстанет от игры). */
export const MAX_DELAY_MS = 600;

/** Режим из хранилища или формы; мусор = «выкл». */
export function sanitizeSoundMode(v) {
  return SOUND_MODES.includes(v) ? v : DEFAULT_SOUND_MODE;
}

/** Темп из формы или хранилища; мусор = «нормально». */
export function sanitizeSpeed(v) {
  return BOT_SPEEDS.includes(v) ? v : 'normal';
}

/** События, которые услышит игрок при данных режиме и темпе (для подсказки в настройках и тестов). */
export function audibleEvents(mode, speed) {
  if (sanitizeSoundMode(mode) === 'off') return [];
  return [...AUDIBLE[sanitizeSpeed(speed)]];
}

/**
 * Планировщик звуков. Помнит, до какого момента занят звук, и отвечает на «событие X сейчас»:
 *   null — не звучать;
 *   { sound, volume, delayMs, dur } — звучать через delayMs (0 — сразу) с громкостью volume.
 * Два планировщика независимы друг от друга (у партии свой).
 */
export function createCuePlanner() {
  let busyUntil = -Infinity;

  return {
    /** @param {string} event  @param {{mode?: string, speed?: string, now: number}} ctx */
    plan(event, { mode, speed, now }) {
      const m = sanitizeSoundMode(mode);
      if (m === 'off') return null;
      const cue = CUES[event];
      if (!cue || !Number.isFinite(now)) return null;
      const sp = sanitizeSpeed(speed);
      if (!AUDIBLE[sp].includes(event)) return null;

      let delay = 0;
      if (now < busyUntil) {
        if (cue.priority < 3) return null;                  // фоновое при занятом звуке пропускается
        delay = busyUntil - now;
        if (delay > MAX_DELAY_MS) return null;              // очередь слишком длинная: лучше промолчать, чем отстать
      }
      busyUntil = now + delay + cue.dur;

      let volume = MODE_VOLUME[m];
      if (event === 'bidBot' && sp === 'step') volume *= BOT_BID_STEP_GAIN;
      return { sound: cue.sound, volume, delayMs: delay, dur: cue.dur };
    },

    /** Партия началась заново или звук выключили: очередь сбрасывается. */
    reset() {
      busyUntil = -Infinity;
    },
  };
}
