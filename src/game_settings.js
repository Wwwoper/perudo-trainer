// game_settings.js — настройки последней сыгранной партии.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage. Хранилище читает и пишет
// storage.js (поле lastGame внутри perudo.settings), интерфейс подключается отдельно.
//
// Настройки: { dice, bots, botStyles[], botLevel, memory, assist, speed, calza, palifico, reveal }.
// Всё, что пришло извне (старая копия, ручная правка, повреждённые данные), проходит sanitizeGameSettings:
// числа зажимаются в допустимые пределы, неизвестные значения заменяются стандартными.

import { BOT_STYLE_IDS, BOT_LEVELS, DEFAULT_BOT_LEVEL, STYLE_AUTO, STYLE_RANDOM } from './bots.js';

export const GAME_SETTINGS_VERSION = 1;
export const DICE_MIN = 1;
export const DICE_MAX = 10;
export const BOTS_MIN = 1;
export const BOTS_MAX = 5;

export const ASSIST_MODES = Object.freeze(['novice', 'training', 'game']);
export const BOT_SPEEDS = Object.freeze(['step', 'slow', 'normal', 'fast']);

const VALID_STYLES = new Set([STYLE_AUTO, STYLE_RANDOM, ...BOT_STYLE_IDS]);

/** Значения «как в первый запуск». Каждый вызов возвращает новый объект. */
export function defaultGameSettings() {
  return {
    dice: 5,
    bots: 3,
    botStyles: [],
    botLevel: DEFAULT_BOT_LEVEL,
    memory: true,
    assist: 'training',
    speed: 'normal',
    calza: false,
    palifico: false,
    reveal: true,
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function clampInt(v, min, max, fallback) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

/**
 * Приводит любые данные к настройкам партии. Никогда не бросает исключений.
 * Стили ботов: не больше BOTS_MAX значений, неизвестный стиль = «по умолчанию».
 * @param {unknown} raw
 */
export function sanitizeGameSettings(raw) {
  const d = defaultGameSettings();
  if (!isObject(raw)) return d;
  const styles = Array.isArray(raw.botStyles) ? raw.botStyles.slice(0, BOTS_MAX) : [];
  return {
    dice: clampInt(raw.dice, DICE_MIN, DICE_MAX, d.dice),
    bots: clampInt(raw.bots, BOTS_MIN, BOTS_MAX, d.bots),
    botStyles: styles.map((s) => (typeof s === 'string' && VALID_STYLES.has(s) ? s : STYLE_AUTO)),
    botLevel: oneOf(raw.botLevel, Object.keys(BOT_LEVELS), d.botLevel),
    memory: bool(raw.memory, d.memory),
    assist: oneOf(raw.assist, ASSIST_MODES, d.assist),
    speed: oneOf(raw.speed, BOT_SPEEDS, d.speed),
    calza: bool(raw.calza, d.calza),
    palifico: bool(raw.palifico, d.palifico),
    reveal: bool(raw.reveal, d.reveal),
  };
}

/** Совпадают ли настройки со стандартными (для кнопки «Сбросить»). */
export function isDefaultGameSettings(s) {
  return JSON.stringify(sanitizeGameSettings(s)) === JSON.stringify(defaultGameSettings());
}

/** Короткая строка для сводки: «5 кубиков · 3 бота · Тренировка · Нормально». */
export function describeGameSettings(s) {
  const v = sanitizeGameSettings(s);
  const bots = v.bots === 1 ? '1 бот' : v.bots < 5 ? `${v.bots} бота` : `${v.bots} ботов`;
  const dice = v.dice === 1 ? '1 кубик' : v.dice < 5 ? `${v.dice} кубика` : `${v.dice} кубиков`;
  const assist = { novice: 'Новичок', training: 'Тренировка', game: 'Игра без подсказок' }[v.assist];
  const speed = { step: 'Пошагово', slow: 'Медленно', normal: 'Нормально', fast: 'Быстро' }[v.speed];
  return [dice, bots, assist, speed].join(' · ');
}
