// player.js — профиль игрока: имя и аватар.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage. Хранилище читает и пишет
// storage.js (ключ perudo.player), интерфейс подключается отдельно.
//
// Игрок: { name: string, avatar: null | { type: 'emoji', value } | { type: 'photo', value } }
//   name   — до NAME_MAX символов; пустое имя значит «не задано» (в интерфейсе показывается «Вы»);
//   avatar — эмодзи из набора AVATAR_EMOJIS или маленький снимок (data-адрес JPEG), иначе null.

export const NAME_MAX = 20;
export const DEFAULT_NAME = 'Вы';

/** Набор эмодзи для аватара. Порядок важен: так они показываются. */
export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🦉', '🐯', '🐸', '🦁', '🐙', '🐧',
  '🦄', '🐺', '🐻', '🦅', '🐢', '🐬', '🦋', '🎲',
];

/** Предельная длина data-адреса снимка (около 8 КБ самого файла). */
export const MAX_PHOTO_CHARS = 12000;
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Управляющие и невидимые символы, из-за которых имя ломает вёрстку или читается задом наперёд. */
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function defaultPlayer() {
  return { name: '', avatar: null };
}

/** Имя: без скрытых символов, пробелы схлопнуты, не длиннее NAME_MAX (по символам, а не по байтам). */
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  const clean = raw.replace(HIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, NAME_MAX).join('').trim();
}

/** Аватар или null, если значение непригодно. */
export function sanitizeAvatar(raw) {
  if (!isObject(raw) || typeof raw.value !== 'string') return null;
  if (raw.type === 'emoji') return AVATAR_EMOJIS.includes(raw.value) ? { type: 'emoji', value: raw.value } : null;
  if (raw.type === 'photo') {
    return raw.value.length <= MAX_PHOTO_CHARS && PHOTO_RE.test(raw.value)
      ? { type: 'photo', value: raw.value } : null;
  }
  return null;
}

/** Приводит что угодно к игроку: мусор заменяется значениями по умолчанию, лишние поля отбрасываются. */
export function sanitizePlayer(raw) {
  if (!isObject(raw)) return defaultPlayer();
  return { name: sanitizeName(raw.name), avatar: sanitizeAvatar(raw.avatar) };
}

/** Имя для показа: заданное или «Вы». */
export function playerDisplayName(player) {
  const name = sanitizeName(player?.name);
  return name || DEFAULT_NAME;
}

/** Игрок ничего не менял: ни имени, ни аватара. */
export function isDefaultPlayer(player) {
  const p = sanitizePlayer(player);
  return !p.name && !p.avatar;
}
