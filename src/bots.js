// bots.js — боты и стратегии (вынесено из core.js)

import { legal, minLegal } from './rules.js';

// Стили ботов
export const BOT_STYLES = {
  careful: {
    id: 'careful', name: 'Осторожный', icon: '🛡️',
    raiseMin: 0.60, dudoBelow: 0.45, bluff: 0.03, trust: 0.20, calza: false,
  },
  bluffer: {
    id: 'bluffer', name: 'Блефующий', icon: '🎭',
    raiseMin: 0.40, dudoBelow: 0.30, bluff: 0.35, trust: 0.10, calza: false,
  },
  smart: {
    id: 'smart', name: 'Умный', icon: '🧠',
    raiseMin: 0.50, dudoBelow: 0.50, bluff: 0.12, trust: 0.35, calza: true,
  },
};

// Генератор имён
const MALE_NAMES = ['Алексей', 'Дмитрий', 'Иван', 'Сергей', 'Николай', 'Андрей', 'Максим', 'Александр', 'Павел', 'Михаил'];
const FEMALE_NAMES = ['Мария', 'Ольга', 'Анна', 'Елена', 'Татьяна', 'Наталья', 'Екатерина', 'Анастасия', 'Ирина', 'Юлия'];

export function generateName(gender = 'random') {
  if (gender === 'male') return MALE_NAMES[Math.floor(Math.random() * MALE_NAMES.length)];
  if (gender === 'female') return FEMALE_NAMES[Math.floor(Math.random() * FEMALE_NAMES.length)];
  const all = [...MALE_NAMES, ...FEMALE_NAMES];
  return all[Math.floor(Math.random() * all.length)];
}

// Генерация персонажа
export function generateCharacter(style = 'random') {
  const gender = Math.random() < 0.5 ? 'male' : 'female';
  const name = generateName(gender);
  const styleKey = style === 'random'
    ? ['careful', 'bluffer', 'smart'][Math.floor(Math.random() * 3)]
    : style;

  return {
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    gender,
    style: styleKey,
    styleConfig: BOT_STYLES[styleKey],
    avatar: generateAvatar(gender),
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

// Простой SVG аватар
export function generateAvatar(gender = 'male') {
  const color1 = ['#4A90D9', '#D94A4A', '#4AD94A', '#D9D94A', '#D94AD9', '#4AD9D9'][Math.floor(Math.random() * 6)];
  const color2 = ['#FFFFFF', '#F0F0F0', '#E0E0E0'][Math.floor(Math.random() * 3)];

  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="${color2}" stroke="${color1}" stroke-width="3"/>
      <circle cx="50" cy="40" r="18" fill="${color1}"/>
      ${gender === 'female'
        ? '<path d="M 30 65 Q 50 80 70 65" stroke="${color1}" stroke-width="3" fill="none"/>'
        : '<path d="M 35 65 L 65 65 L 60 75 L 40 75 Z" fill="${color1}"/>'}
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

  const pr = (q, f) => probBid(q, f, publicState.totalDice, hand, wild);

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
    const pCurrent = pr(b.q, b.f);
    if (pe >= 0.30 && pCurrent >= 0.25 && pCurrent <= 0.9) {
      return { type: 'calza', reason: `шанс точного совпадения ${(pe * 100).toFixed(0)}%` };
    }
  }

  // Dudo
  if (b) {
    const p = pr(b.q, b.f);
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