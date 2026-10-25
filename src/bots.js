// bots.js — боты и стратегии (вынесено из core.js)

import { legal, minLegal } from './rules.js';

// Стили ботов.
// raiseMin  — минимальная вероятность ставки, которую бот считает надёжной для повышения;
// dudoBelow — ниже этой вероятности чужой ставки бот говорит «Не верю»;
// bluff     — шанс, что вместо надёжной ставки бот рискнёт слабой;
// calza     — умеет ли говорить Calza;
// noise     — размах ошибки в оценке вероятности (±), как у человека, который считает «на глаз»;
// adapt     — насколько бот меняет доверие к ставкам человека по тому, как тот блефовал раньше
//             (0 — не учитывает совсем, 1 — учитывает сильнее всех);
// trust     — зарезервировано (в решении пока не участвует).
export const BOT_STYLES = {
  careful: {
    id: 'careful', name: 'Осторожный', icon: '🛡️',
    desc: 'ставит только надёжно, почти не блефует',
    raiseMin: 0.60, dudoBelow: 0.45, bluff: 0.03, trust: 0.20, calza: false, noise: 0.05, adapt: 0.4,
  },
  bluffer: {
    id: 'bluffer', name: 'Блефующий', icon: '🎭',
    desc: 'часто завышает ставку: его стоит проверять',
    raiseMin: 0.40, dudoBelow: 0.30, bluff: 0.35, trust: 0.10, calza: false, noise: 0.1, adapt: 0.15,
  },
  smart: {
    id: 'smart', name: 'Умный', icon: '🧠',
    desc: 'считает вероятности и умеет говорить Calza',
    raiseMin: 0.50, dudoBelow: 0.50, bluff: 0.12, trust: 0.35, calza: true, noise: 0.03, adapt: 1.0,
  },
  aggressor: {
    id: 'aggressor', name: 'Агрессор', icon: '🔥',
    desc: 'быстро взвинчивает ставки и редко проверяет',
    raiseMin: 0.35, dudoBelow: 0.20, bluff: 0.30, trust: 0.05, calza: false, noise: 0.1, adapt: 0.1,
  },
  skeptic: {
    id: 'skeptic', name: 'Скептик', icon: '🧐',
    desc: 'не доверяет чужим ставкам и часто говорит «Не верю»',
    raiseMin: 0.55, dudoBelow: 0.62, bluff: 0.05, trust: 0.15, calza: false, noise: 0.06, adapt: 0.5,
  },
};

export const BOT_STYLE_IDS = Object.freeze(Object.keys(BOT_STYLES));

// Раздача стилей по умолчанию: три базовых по кругу (как было до выбора вручную).
export const DEFAULT_STYLE_CYCLE = Object.freeze(['careful', 'bluffer', 'smart']);

// Уровень ботов = во сколько раз умножается размах ошибок `noise` стиля.
export const BOT_LEVELS = Object.freeze({
  easy: { id: 'easy', name: 'Лёгкий', desc: 'часто ошибаются в расчётах', noise: 2.5 },
  normal: { id: 'normal', name: 'Обычный', desc: 'иногда ошибаются, как люди', noise: 1 },
  hard: { id: 'hard', name: 'Сильный', desc: 'считают без ошибок', noise: 0 },
});
export const DEFAULT_BOT_LEVEL = 'normal';

/** Множитель шума для уровня; неизвестный уровень = обычный. */
export function noiseForLevel(level) {
  return (BOT_LEVELS[level] || BOT_LEVELS[DEFAULT_BOT_LEVEL]).noise;
}

// Самая большая поправка к оценке ставки по «памяти» о блефе соперника.
export const MAX_MEMORY_SHIFT = 0.25;
const MEMORY_BASE_RATE = 0.3;      // доля блефа, при которой поправки нет (= PRIOR_RATE из memory.js)

export const STYLE_AUTO = 'auto';
export const STYLE_RANDOM = 'random';

/**
 * Превращает выбор пользователя в список стилей для `count` ботов.
 * choices[i]: id стиля | 'auto' (по умолчанию, по кругу) | 'random' (любой из всех).
 * Незнакомое значение или его отсутствие считается 'auto', поэтому
 * испорченные настройки не ломают создание партии.
 */
export function pickBotStyles(count, choices = [], rng = Math.random) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = choices[i];
    if (c === STYLE_RANDOM) out.push(BOT_STYLE_IDS[Math.floor(rng() * BOT_STYLE_IDS.length)]);
    else if (BOT_STYLES[c]) out.push(c);
    else out.push(DEFAULT_STYLE_CYCLE[i % DEFAULT_STYLE_CYCLE.length]);
  }
  return out;
}

// Генератор имён
const MALE_NAMES = ['Алексей', 'Дмитрий', 'Иван', 'Сергей', 'Николай', 'Андрей', 'Максим', 'Александр', 'Павел', 'Михаил'];
const FEMALE_NAMES = ['Мария', 'Ольга', 'Анна', 'Елена', 'Татьяна', 'Наталья', 'Екатерина', 'Анастасия', 'Ирина', 'Юлия'];

const norm = (n) => String(n ?? '').trim().toLowerCase();

/**
 * Случайное имя. `avoid` — имена, которые брать нельзя (уже занятые за столом, имя игрока):
 * сравнение без учёта регистра. Если в нужном списке свободных не осталось, берётся из другого;
 * если не осталось совсем (больше 20 имён за столом), к имени добавляется номер.
 * `rng` — источник случайных чисел [0, 1), по умолчанию Math.random (нужен для тестов).
 */
export function generateName(gender = 'random', { avoid = [], rng = Math.random } = {}) {
  const taken = new Set(avoid.map(norm));
  const free = (list) => list.filter((n) => !taken.has(norm(n)));
  const pick = (list) => list[Math.floor(rng() * list.length)];
  let pool = gender === 'male' ? free(MALE_NAMES)
    : gender === 'female' ? free(FEMALE_NAMES)
      : free([...MALE_NAMES, ...FEMALE_NAMES]);
  if (!pool.length) pool = free([...MALE_NAMES, ...FEMALE_NAMES]);
  if (pool.length) return pick(pool);
  const base = pick([...MALE_NAMES, ...FEMALE_NAMES]);
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// Генерация персонажа. avoidNames — имена, которые нельзя использовать (см. generateName).
export function generateCharacter(style = 'random', { avoidNames = [], rng = Math.random } = {}) {
  const gender = rng() < 0.5 ? 'male' : 'female';
  const name = generateName(gender, { avoid: avoidNames, rng });
  const styleKey = style === 'random'
    ? BOT_STYLE_IDS[Math.floor(rng() * BOT_STYLE_IDS.length)]
    : style;
  // Если имя пришлось взять из другого списка, пол персонажа следует за именем.
  const base = name.replace(/ \d+$/, '');
  const realGender = FEMALE_NAMES.includes(base) ? 'female' : MALE_NAMES.includes(base) ? 'male' : gender;

  return {
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    gender: realGender,
    style: styleKey,
    styleConfig: BOT_STYLES[styleKey],
    avatar: generateAvatar(realGender),
    color: generateColor(),
    memory: {
      gamesPlayed: 0,
      wins: 0,
      totalBids: 0,
      riskyBids: 0,
      dudoCalls: 0,
      bluffsCaught: 0,
      calzaAttempts: 0,
      favoriteFaces: [0, 0, 0, 0, 0, 0, 0],
    },
  };
}

/**
 * Персонажи для всех ботов за столом: имена не повторяются между собой
 * и не совпадают с `avoidNames` (обычно это имя игрока).
 */
export function generateCharacters(styles, { avoidNames = [], rng = Math.random } = {}) {
  const taken = [...avoidNames];
  return styles.map((style) => {
    const c = generateCharacter(style, { avoidNames: taken, rng });
    taken.push(c.name);
    return c;
  });
}

// Простой SVG аватар
export function generateAvatar(gender = 'male') {
  const color1 = ['#4A90D9', '#D94A4A', '#4AD94A', '#D9D94A', '#D94AD9', '#4AD9D9'][Math.floor(Math.random() * 6)];
  const color2 = ['#FFFFFF', '#F0F0F0', '#E0E0E0'][Math.floor(Math.random() * 3)];

  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="${color2}" stroke="${color1}" stroke-width="3"/>
      <circle cx="50" cy="40" r="18" fill="${color1}"/>
      ${gender === 'female'
        ? `<path d="M 30 65 Q 50 80 70 65" stroke="${color1}" stroke-width="3" fill="none"/>`
        : `<path d="M 35 65 L 65 65 L 60 75 L 40 75 Z" fill="${color1}"/>`}
    </svg>
  `.trim();
}

export function generateColor() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  return colors[Math.floor(Math.random() * colors.length)];
}

/* =============================================================
   Решение бота.
   Интерфейс ставки — ЕДИНЫЙ {q, f} (как в engine.js и rules.js).
   Раньше здесь читались b.quantity / b.face, из-за чего любой
   бот отвечал «dudo» на любую ставку (см. CHANGELOG).
   ============================================================= */
export function botDecide(state) {
  const { hand, publicState, bid, rules, style, opps, canCalza, rng = Math.random } = state;
  // noise — множитель ошибок (0 по умолчанию: функция остаётся детерминированной);
  // opponent = { bluffRate, samples } — что бот помнит о том, кто сделал текущую ставку.
  const noiseMul = Number.isFinite(state.noise) ? Math.max(0, state.noise) : 0;
  const opponent = state.opponent || null;
  const arch = style || BOT_STYLES.smart;
  const wild = !rules || rules.wild !== false;

  const comb = (n, k) => {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  };

  const probBid = (q, face, n, h, w) => {
    const own = h.filter(d => d === face || (w && d === 1 && face !== 1)).length;
    const need = q - own;
    const unknown = n - h.length;
    const p = face === 1 || !w ? 1 / 6 : 1 / 3;
    if (need <= 0) return 1;
    if (need > unknown) return 0;
    let s = 0;
    for (let k = need; k <= unknown; k++) {
      s += comb(unknown, k) * Math.pow(p, k) * Math.pow(1 - p, unknown - k);
    }
    return Math.min(1, s);
  };

  const exact = (q, f) => probBid(q, f, publicState.totalDice, hand, wild);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  // «Восприятие» бота: точная вероятность плюс ошибка. Для одной и той же ставки
  // ошибка одна на весь ход, иначе бот противоречил бы сам себе.
  const amp = (arch.noise || 0) * noiseMul;
  const seen = new Map();
  const pr = (q, f) => {
    const p = exact(q, f);
    if (!amp) return p;
    const key = q * 10 + f;
    if (!seen.has(key)) seen.set(key, (rng() * 2 - 1) * amp);
    return clamp01(p + seen.get(key));
  };

  // Поправка к оценке чужой ставки: если соперник блефовал чаще обычного, верим меньше, и наоборот.
  const memoryShift = opponent && Number.isFinite(opponent.bluffRate)
    ? Math.max(-MAX_MEMORY_SHIFT, Math.min(MAX_MEMORY_SHIFT, (arch.adapt || 0) * (opponent.bluffRate - MEMORY_BASE_RATE)))
    : 0;

  // Единый формат ставки — {q, f}. Дополнительно терпим legacy {quantity, face}.
  const bq = bid ? (bid.q ?? bid.quantity) : null;
  const bf = bid ? (bid.f ?? bid.face) : null;
  const b = (bq != null && bf != null) ? { q: bq, f: bf } : null;

  // Calza
  if (canCalza && arch.calza && b) {
    const own = hand.filter(d => d === b.f || (wild && d === 1 && b.f !== 1)).length;
    const need = b.q - own;
    const unknown = publicState.totalDice - hand.length;
    const pp = b.f === 1 || !wild ? 1 / 6 : 1 / 3;
    const pe = (need < 0 || need > unknown)
      ? 0
      : comb(unknown, need) * Math.pow(pp, need) * Math.pow(1 - pp, unknown - need);
    const pCurrent = clamp01(pr(b.q, b.f) - memoryShift);
    if (pe >= 0.30 && pCurrent >= 0.25 && pCurrent <= 0.9) {
      return { type: 'calza', reason: `шанс точного совпадения ${(pe * 100).toFixed(0)}%` };
    }
  }

  // Dudo
  if (b) {
    const p = clamp01(pr(b.q, b.f) - memoryShift);
    if (p < arch.dudoBelow) {
      return { type: 'dudo', reason: `оценил ставку в ${(p * 100).toFixed(0)}%` };
    }
  }

  // Кандидаты на повышение
  const cands = [];
  for (let q = 1; q <= publicState.totalDice; q++) {
    for (let f = 1; f <= 6; f++) {
      if (legal(q, f, b, rules)) cands.push({ q, f, p: pr(q, f) });
    }
  }

  if (!cands.length) {
    return b
      ? { type: 'dudo', reason: 'повышать некуда' }
      : { type: 'raise', ...minLegal(null, publicState.totalDice, rules), reason: 'первая ставка' };
  }

  const good = cands.filter(c => c.p >= arch.raiseMin);

  if (rng() < arch.bluff || !good.length) {
    const pool = cands.filter(c => c.p >= 0.18 && c.p < arch.raiseMin);
    if (pool.length && (good.length || b)) {
      if (!good.length && b && cands.every(c => c.p < 0.18)) {
        return { type: 'dudo', reason: 'безопасных ставок нет' };
      }
      const c = pool[Math.floor(rng() * pool.length)];
      return { type: 'raise', q: c.q, f: c.f, p: c.p, bluff: true, reason: 'блеф' };
    }
    if (!good.length) {
      if (b) return { type: 'dudo', reason: 'безопасных ставок нет' };
      const m = cands.sort((x, y) => y.p - x.p)[0];
      return { type: 'raise', q: m.q, f: m.f, p: m.p, reason: 'единственный вариант' };
    }
  }

  const mx = Math.max(...good.map(c => c.p));
  const near = good.filter(c => c.p >= mx - 0.08);
  const c = near[Math.floor(rng() * near.length)];
  return { type: 'raise', q: c.q, f: c.f, p: c.p, reason: 'надёжная ставка' };
}

export function updateMemory(memory, event) {
  const m = { ...memory };
  if (event.type === 'GAME_ENDED') {
    m.gamesPlayed++;
    if (event.winner === memory.playerId) m.wins++;
  }
  if (event.type === 'BID_PLACED') {
    m.totalBids++;
    m.favoriteFaces[event.face] = (m.favoriteFaces[event.face] || 0) + 1;
    if (event.probability && event.probability < 0.4) m.riskyBids++;
  }
  if (event.type === 'DUDO_CALLED') m.dudoCalls++;
  if (event.type === 'CALZA_CALLED') m.calzaAttempts++;
  if (event.type === 'DICE_REVEALED' && event.bluffCaught) m.bluffsCaught++;
  return m;
}

export function getCharacterStats(memory) {
  return {
    gamesPlayed: memory.gamesPlayed || 0,
    wins: memory.wins || 0,
    winRate: memory.gamesPlayed > 0 ? (memory.wins / memory.gamesPlayed * 100).toFixed(1) + '%' : '—',
    totalBids: memory.totalBids || 0,
    riskyBidRate: memory.totalBids > 0 ? (memory.riskyBids / memory.totalBids * 100).toFixed(1) + '%' : '—',
    dudoCalls: memory.dudoCalls || 0,
    calzaAttempts: memory.calzaAttempts || 0,
    bluffsCaught: memory.bluffsCaught || 0,
    favoriteFace: memory.favoriteFaces
      ? memory.favoriteFaces.reduce((max, v, i) => (v > max[1] ? [i, v] : max), [0, 0])[0]
      : 0,
  };
}