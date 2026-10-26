// sound_engine.js — воспроизведение звуков через Web Audio по правилам sound_plan.js.
//
// Без обращений к странице (document, window): всё нужное передаётся в createSoundEngine, поэтому движок
// проверяется в тестах с поддельным AudioContext. Любая ошибка звука гасится: игра не должна страдать
// из-за того, что звук недоступен (старый браузер, запрет, закрытый контекст).

import { createCuePlanner, sanitizeSoundMode } from './sound_plan.js';
import { RECIPES } from './sound_recipes.js';

const ATTACK_S = 0.005;     // нарастание громкости: без щелчка в начале ноты
const RELEASE_FLOOR = 0.0001;

/**
 * @param {object} deps
 * @param {Function|null} deps.AudioContextCtor  конструктор AudioContext (или null, если звука нет)
 * @param {() => string} deps.getMode            режим звука: off | quiet | normal
 * @param {() => string} deps.getSpeed           темп ботов: step | slow | normal | fast
 * @param {() => number} [deps.now]              время в мс (для тестов можно подменить)
 */
export function createSoundEngine({ AudioContextCtor, getMode, getSpeed, now = () => Date.now() }) {
  const planner = createCuePlanner();
  let ctx = null;
  let broken = false;

  /** Вызывается по жесту игрока (клик, касание, клавиша): браузер разрешает звук только после него. */
  function unlock() {
    if (broken) return false;
    try {
      if (!ctx) {
        if (typeof AudioContextCtor !== 'function') { broken = true; return false; }
        ctx = new AudioContextCtor();
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const r = ctx.resume();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
      return true;
    } catch (e) {
      broken = true;
      ctx = null;
      return false;
    }
  }

  function playNotes(recipe, volume, startAt) {
    for (const n of recipe) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = startAt + n.at / 1000;
      const t1 = t0 + n.dur / 1000;
      const peak = Math.max(RELEASE_FLOOR * 2, n.gain * volume);
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, t0);
      if (n.to) osc.frequency.linearRampToValueAtTime(n.to, t1);
      g.gain.setValueAtTime(RELEASE_FLOOR, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(ATTACK_S, (t1 - t0) / 2));
      g.gain.exponentialRampToValueAtTime(RELEASE_FLOOR, t1);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }

  /** Событие игры: звучит, если режим, темп и очередь это позволяют. Возвращает true, если звук запущен. */
  function cue(event) {
    try {
      const mode = sanitizeSoundMode(getMode());
      if (mode === 'off') return false;
      if (!ctx || broken) return false;                        // страница ещё не получила жест игрока
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const r = ctx.resume();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
      const plan = planner.plan(event, { mode, speed: getSpeed(), now: now() });
      if (!plan) return false;
      const recipe = RECIPES[plan.sound];
      if (!recipe) return false;
      playNotes(recipe, plan.volume, ctx.currentTime + plan.delayMs / 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    unlock,
    cue,
    /** Новая партия: очередь звуков очищается. */
    reset() { planner.reset(); },
    get unlocked() { return !!ctx && !broken; },
  };
}
