// saved_game.js — снимок незавершённой партии: сохранить и безопасно восстановить после перезагрузки.
//
// Модуль чистый: ничего не знает ни о браузере, ни о localStorage, ни об интерфейсе. Хранилище читает
// и пишет storage.js (ключ perudo.activeGame), подключение к партии — отдельно.
//
// Снимок: { v, savedAt, game, log, reviews, moments, mind }
//   game    — состояние движка (только поля, которые нужны, чтобы партия шла дальше);
//   log     — строки журнала партии { type, html, round };
//   reviews — записи вкладки «Разбор»;
//   moments — решения игрока (из них в конце партии выбираются ключевые моменты);
//   mind    — уровень ботов и «боты запоминают мою игру» на момент старта партии.
//
// Всё, что приходит из хранилища, не доверяется: партия восстанавливается, только если проходит
// строгую проверку. Любая странность — снимок отбрасывается целиком (лучше начать заново, чем сломать стол).
// HTML в журнале пропускается через список разрешённых тегов, остальное отбрасывается.

import { BOT_STYLE_IDS, BOT_LEVELS, DEFAULT_BOT_LEVEL, generateAvatar, generateColor } from './bots.js';
import { ASSIST_MODES, BOT_SPEEDS } from './game_settings.js';
import { sanitizeMoment } from './moments.js';

export const SAVE_VERSION = 1;
/** Незавершённая партия старше этого срока не предлагается (7 суток). */
export const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const MAX_PLAYERS = 6;
const MAX_LOG = 500;
const MAX_REVIEWS = 200;
const MAX_MOMENTS = 200;
const MAX_HTML = 2000;
const MAX_ROUND = 1000;
const MAX_DICE = 10;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isFace = (v) => isInt(v) && v >= 1 && v <= 6;
const isProb = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// ---------- Безопасный HTML (журнал и «Разбор») ----------

// Приложение само пишет в журнал только такие теги: span, em, i, b, strong, small, div, br; атрибуты class и title.
const TAG_RE = /^<\/?(?:span|em|i|b|strong|small|div|br)(?:\s+(?:class|title)="[\w\s:.,×—–-]{0,80}")*\s*\/?>$/u;

/**
 * Возвращает строку как есть, если в ней только разрешённые теги без опасных атрибутов; иначе null.
 * Текст между тегами экранирован приложением, поэтому «<» вне разрешённых тегов считается подделкой.
 */
export function safeHtml(s) {
  if (typeof s !== 'string' || s.length > MAX_HTML) return null;
  const tags = s.match(/<[^>]*>?/g) || [];
  for (const t of tags) if (!TAG_RE.test(t)) return null;
  // «<» без парной «>» и любые остатки вне найденных тегов
  if (s.replace(/<[^>]*>/g, '').includes('<')) return null;
  return s;
}

function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, max);
}

// ---------- Игра ----------

// Аватар бота рисует generateAvatar; любой другой SVG не принимается (будет нарисован заново).
const HEX = '#[0-9A-Fa-f]{6}';
const AVATAR_RE = new RegExp(
  '^<svg viewBox="0 0 100 100" xmlns="http://www\\.w3\\.org/2000/svg">\\s*'
  + `<circle cx="50" cy="50" r="48" fill="${HEX}" stroke="${HEX}" stroke-width="3"/>\\s*`
  + `<circle cx="50" cy="40" r="18" fill="${HEX}"/>\\s*`
  + `<path (?:d="M 30 65 Q 50 80 70 65" stroke="${HEX}" stroke-width="3" fill="none"|d="M 35 65 L 65 65 L 60 75 L 40 75 Z" fill="${HEX}")/>\\s*`
  + '</svg>$',
);
const COLOR_RE = new RegExp(`^${HEX}$`);

function cleanBid(raw, ids) {
  if (!isObject(raw) || typeof raw.playerId !== 'string' || !ids.has(raw.playerId)) return null;
  if (!isInt(raw.q) || raw.q < 1 || raw.q > 100 || !isFace(raw.f)) return null;
  return { playerId: raw.playerId, q: raw.q, f: raw.f };
}

function cleanMemory(raw) {
  const m = isObject(raw) ? raw : {};
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e6) : 0);
  const faces = Array.isArray(m.favoriteFaces) ? m.favoriteFaces : [];
  return {
    gamesPlayed: n(m.gamesPlayed), wins: n(m.wins), totalBids: n(m.totalBids), riskyBids: n(m.riskyBids),
    dudoCalls: n(m.dudoCalls), bluffsCaught: n(m.bluffsCaught), calzaAttempts: n(m.calzaAttempts),
    favoriteFaces: Array.from({ length: 7 }, (_, i) => n(faces[i])),
  };
}

/**
 * Проверяет состояние партии. Возвращает чистую партию (готовую к игре) или null.
 * Только активная партия: ждущая и законченная не сохраняются.
 */
export function sanitizeGame(raw) {
  if (!isObject(raw) || raw.state !== 'active') return null;
  const cfg = isObject(raw.config) ? raw.config : null;
  if (!cfg || !isInt(cfg.startDice) || cfg.startDice < 1 || cfg.startDice > MAX_DICE) return null;
  const calza = raw.calzaEnabled === true;
  const palificoOn = raw.palificoEnabled === true;
  if (typeof raw.calzaEnabled !== 'boolean' || typeof raw.palificoEnabled !== 'boolean') return null;
  if (!ASSIST_MODES.includes(raw.assistMode) || !BOT_SPEEDS.includes(raw.botSpeed)) return null;

  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > MAX_PLAYERS) return null;
  const players = [];
  for (let i = 0; i < raw.players.length; i++) {
    const p = raw.players[i];
    if (!isObject(p)) return null;
    const wantId = i === 0 ? 'human' : `bot_${i - 1}`;
    if (p.id !== wantId || p.isBot !== (i > 0)) return null;
    if (!isInt(p.dice) || p.dice < 0 || p.dice > cfg.startDice) return null;
    if (typeof p.alive !== 'boolean' || p.alive !== (p.dice > 0)) return null;
    // У выбывшего игрока движок оставляет старые кубики в руке: при восстановлении они не нужны.
    const hand = p.alive ? (Array.isArray(p.hand) ? p.hand : null) : [];
    if (!hand || hand.length !== (p.alive ? p.dice : 0) || !hand.every(isFace)) return null;
    const name = cleanText(p.name, 40);
    if (!name) return null;
    const out = {
      id: p.id, name, hand: hand.slice(), dice: p.dice, alive: p.alive, isBot: p.isBot,
      palificoUsed: p.palificoUsed === true,
    };
    if (i > 0) {
      if (!BOT_STYLE_IDS.includes(p.style)) return null;
      const gender = p.gender === 'female' ? 'female' : 'male';
      out.style = p.style;
      out.gender = gender;
      const ch = isObject(p.character) ? p.character : {};
      const avatar = typeof p.avatar === 'string' && AVATAR_RE.test(p.avatar) ? p.avatar : generateAvatar(gender);
      const color = typeof ch.color === 'string' && COLOR_RE.test(ch.color) ? ch.color : generateColor();
      out.avatar = avatar;
      out.character = {
        id: cleanText(ch.id, 64) || `char_restored_${i}`,
        name, gender, style: p.style, avatar, color, memory: cleanMemory(ch.memory),
      };
    }
    players.push(out);
  }
  const alive = players.filter((p) => p.alive);
  if (alive.length < 2) return null;

  if (!isInt(raw.round) || raw.round < 1 || raw.round > MAX_ROUND) return null;
  if (!isInt(raw.currentPlayer) || raw.currentPlayer < 0 || raw.currentPlayer >= players.length
    || !players[raw.currentPlayer].alive) return null;
  if (typeof raw.palifico !== 'boolean') return null;
  if (raw.palifico && !palificoOn) return null;

  const ids = new Set(players.map((p) => p.id));
  let bid = null;
  if (raw.bid != null) {
    bid = cleanBid(raw.bid, ids);
    if (!bid || bid.playerId === players[raw.currentPlayer].id) return null;   // своё слово не проверяют
    bid.playerName = players.find((p) => p.id === bid.playerId).name;
  }
  let bidHistory = [];
  if (raw.bidHistory != null) {
    if (!Array.isArray(raw.bidHistory) || raw.bidHistory.length > 200) return null;
    bidHistory = raw.bidHistory.map((b) => cleanBid(b, ids));
    if (bidHistory.some((b) => !b)) return null;
    for (const b of bidHistory) b.playerName = players.find((p) => p.id === b.playerId).name;
  }
  if (!bid && bidHistory.length) return null;
  if (bid) {
    const last = bidHistory[bidHistory.length - 1];
    if (!last || last.playerId !== bid.playerId || last.q !== bid.q || last.f !== bid.f) return null;
  }

  const id = typeof raw.id === 'string' && /^game_\d{1,20}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;

  const botNames = players.slice(1).map((p) => p.name);
  return {
    id,
    config: {
      playerId: 'human', botCount: players.length - 1, startDice: cfg.startDice,
      calzaEnabled: calza, palificoEnabled: palificoOn,
      assistMode: raw.assistMode, botSpeed: raw.botSpeed, botNames,
    },
    players,
    currentPlayer: raw.currentPlayer,
    round: raw.round,
    bid,
    bidHistory,
    palifico: raw.palifico,
    calzaEnabled: calza,
    palificoEnabled: palificoOn,
    assistMode: raw.assistMode,
    botSpeed: raw.botSpeed,
    state: 'active',
    winner: null,
    log: [],
    events: [],
  };
}

// ---------- Журнал, разбор, решения ----------

function cleanLog(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(-MAX_LOG)) {
    if (!isObject(e)) continue;
    const html = safeHtml(e.html);
    if (html === null) continue;
    const type = typeof e.type === 'string' && /^[a-z-]{0,20}$/.test(e.type) ? e.type : '';
    out.push({ type, html, round: isInt(e.round) && e.round >= 0 && e.round <= MAX_ROUND ? e.round : 0 });
  }
  return out;
}

function cleanReview(raw) {
  if (!isObject(raw) || !['raise', 'dudo', 'calza'].includes(raw.kind)) return null;
  if (!isProb(raw.prob) || !isInt(raw.round) || raw.round < 0 || raw.round > MAX_ROUND) return null;
  const text = safeHtml(raw.text);
  if (text === null) return null;
  const v = raw.v;
  if (!isObject(v) || !['good', 'meh', 'bad'].includes(v.code)) return null;
  const outcome = raw.outcome ? safeHtml(raw.outcome) : '';
  if (outcome === null) return null;
  const out = {
    kind: raw.kind, prob: raw.prob, text, round: raw.round, outcome,
    v: {
      code: v.code,
      label: cleanText(v.label, 60),
      score: Number.isFinite(v.score) ? Math.max(0, Math.min(1, v.score)) : 0,
    },
  };
  if (v.softened === true) out.v.softened = true;
  const note = cleanText(raw.note, 400);
  if (note) out.note = note;
  if (isProb(raw.probRead)) out.probRead = raw.probRead;
  if (isInt(raw.handSize) && raw.handSize >= 0 && raw.handSize <= MAX_DICE) out.handSize = raw.handSize;
  if (isInt(raw.ownMatch) && raw.ownMatch >= 0 && raw.ownMatch <= MAX_DICE) out.ownMatch = raw.ownMatch;
  if (Number.isFinite(raw.trust) && raw.trust >= 0 && raw.trust <= 1) out.trust = raw.trust;
  return out;
}

function cleanMind(raw) {
  const m = isObject(raw) ? raw : {};
  return {
    level: Object.keys(BOT_LEVELS).includes(m.level) ? m.level : DEFAULT_BOT_LEVEL,
    memory: typeof m.memory === 'boolean' ? m.memory : true,
  };
}

// ---------- Снимок ----------

/**
 * Снимок для хранения. Возвращает null, если партии нет или она не идёт.
 * Данные копируются: дальнейшие ходы снимок не меняют.
 */
export function makeSnapshot({ game, log = [], reviews = [], moments = [], mind = null, now = Date.now() } = {}) {
  if (!game || game.state !== 'active') return null;
  const copy = JSON.parse(JSON.stringify({ game, log, reviews, moments, mind }));
  copy.game.events = [];
  copy.game.log = [];
  return { v: SAVE_VERSION, savedAt: now, ...copy };
}

/**
 * Проверка снимка из хранилища. Возвращает { game, log, reviews, moments, mind, savedAt } или null.
 * Записи журнала, «Разбора» и решений с мусором отбрасываются по одной, а мусор в самой партии отбрасывает всё.
 */
export function restoreSnapshot(raw, { now = Date.now() } = {}) {
  if (!isObject(raw) || raw.v !== SAVE_VERSION) return null;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;
  if (raw.savedAt > now + 24 * 3600 * 1000) return null;          // «из будущего»: часы сбились или данные подделаны
  if (now - raw.savedAt > MAX_AGE_MS) return null;
  const game = sanitizeGame(raw.game);
  if (!game) return null;
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews.slice(-MAX_REVIEWS) : []).map(cleanReview).filter(Boolean);
  const moments = (Array.isArray(raw.moments) ? raw.moments.slice(-MAX_MOMENTS) : []).map(sanitizeMoment).filter(Boolean);
  return { game, log: cleanLog(raw.log), reviews, moments, mind: cleanMind(raw.mind), savedAt: raw.savedAt };
}

/** Короткая подпись для карточки «Продолжить»: «Раунд 3 · у вас 4 кубика · ботов 3». */
export function describeSnapshot(snap) {
  const g = snap && snap.game;
  if (!g || !Array.isArray(g.players) || !g.players[0]) return '';
  const mine = g.players[0].dice;
  const word = (n, one, few, many) => {
    const m100 = n % 100; const m10 = n % 10;
    if (m100 >= 11 && m100 <= 14) return many;
    if (m10 === 1) return one;
    if (m10 >= 2 && m10 <= 4) return few;
    return many;
  };
  const bots = g.players.length - 1;
  const left = g.players.filter((p) => p.alive).length - 1;
  return [
    `Раунд ${g.round}`,
    `у вас ${mine} ${word(mine, 'кубик', 'кубика', 'кубиков')}`,
    `ботов в игре: ${left} из ${bots}`,
  ].join(' · ');
}
