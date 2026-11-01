// bot_pace.js — темп ходов ботов. Чистый модуль: без DOM и таймеров.
//
// «Пошагово» не имеет задержки: бот ходит только после кнопки игрока. У остальных темпов ход
// бота запускается сам через botDelayMs(speed) миллисекунд.

export const STEP_SPEED = 'step';

/** Задержка перед автоматическим ходом бота, мс. */
export const BOT_DELAYS = Object.freeze({ slow: 2600, normal: 1100, fast: 320 });

/** Пошаговый ли темп. */
export function isStepMode(speed) {
  return speed === STEP_SPEED;
}

/**
 * Через сколько мс бот должен сходить сам; null — ждать кнопку игрока («Пошагово»).
 * Неизвестный темп считается обычным.
 */
export function botDelayMs(speed) {
  if (isStepMode(speed)) return null;
  return Object.prototype.hasOwnProperty.call(BOT_DELAYS, speed) ? BOT_DELAYS[speed] : BOT_DELAYS.normal;
}

/**
 * Надо ли показывать кнопку «Ход бота»: пошаговый темп, партия идёт, ходит не человек.
 * @param {{speed: string, state: string, currentPlayer: number}} s
 */
export function needsStepButton({ speed, state, currentPlayer }) {
  return isStepMode(speed) && state === 'active' && currentPlayer !== 0;
}
